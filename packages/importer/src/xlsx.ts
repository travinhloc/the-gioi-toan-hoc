/**
 * Đọc và ghi .xlsx tối thiểu: chỉ giá trị ô, đủ cho bảng câu hỏi. Không cần thư viện ngoài.
 */
import { readZip, writeZip } from "./zip";

/** Một ô đã đọc. `date` có khi Excel lưu ô dưới dạng ngày (thường do gõ 1/2 vào ô không phải Văn bản). */
export interface Cell {
  text: string;
  date?: { y: number; m: number; d: number };
}

export type Sheet = Cell[][];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? m;
    })
    .replace(/_x([0-9A-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]!] = unescapeXml(m[2]!);
  return out;
}

/** Ghép mọi <t> trong một đoạn chữ (chữ nhiều định dạng), bỏ phần phiên âm <rPh>. */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  return [...clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)].map((m) => unescapeXml(m[1] ?? "")).join("");
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Mã định dạng số dựng sẵn của Excel là ngày/giờ.
const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormat(code: string): boolean {
  const s = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return /[dmyhs]/i.test(s) && !/^general$/i.test(s);
}

/** Số ngày kiểu Excel (hệ 1900) sang ngày tháng năm. */
function serialToDate(serial: number): { y: number; m: number; d: number } {
  const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Số thực từ Excel có thể lệch kiểu 0.30000000000000004; làm tròn 15 chữ số như Excel hiển thị. */
function numberText(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(Number(n.toPrecision(15))) : v;
}

export interface Workbook {
  sheets: { name: string; rows: Sheet }[];
}

export async function readXlsx(bytes: Uint8Array): Promise<Workbook> {
  const files = await readZip(bytes);
  const dec = new TextDecoder();
  const get = (path: string) => {
    const f = files.get(path);
    return f ? dec.decode(f) : null;
  };

  const shared = [...(get("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));

  const styles = get("xl/styles.xml") ?? "";
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    custom.set(Number(a.numFmtId), a.formatCode ?? "");
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  const dateStyle = [...xfs.matchAll(/<xf\b([^>]*?)\/?>/g)].map((m) => {
    const id = Number(attrs(m[1]!).numFmtId ?? 0);
    return custom.has(id) ? isDateFormat(custom.get(id)!) : BUILTIN_DATE.has(id);
  });

  const workbook = get("xl/workbook.xml") ?? "";
  const rels = new Map<string, string>();
  for (const m of (get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    if (a.Id && a.Target) rels.set(a.Id, a.Target.startsWith("/") ? a.Target.slice(1) : `xl/${a.Target}`);
  }

  const sheets: Workbook["sheets"] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    const path = rels.get(a["r:id"] ?? "");
    const xml = path ? get(path) : null;
    if (!xml) continue;
    sheets.push({ name: a.name ?? "", rows: parseSheet(xml, shared, dateStyle) });
  }
  if (sheets.length === 0) throw new Error("Không tìm thấy trang tính nào trong file .xlsx.");
  return { sheets };
}

function parseSheet(xml: string, shared: string[], dateStyle: boolean[]): Sheet {
  const rows: Sheet = [];
  let rowNo = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attrs(rm[1]!).r;
    rowNo = r ? Number(r) : rowNo + 1;
    const row: Cell[] = [];
    let col = -1;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = attrs(cm[1]!);
      col = a.r ? colIndex(a.r) : col + 1;
      const inner = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let cell: Cell;
      switch (a.t) {
        case "s":
          cell = { text: shared[Number(v)] ?? "" };
          break;
        case "inlineStr":
          cell = { text: textOf(inner) };
          break;
        case "str":
        case "e":
          cell = { text: unescapeXml(v ?? "") };
          break;
        case "b":
          cell = { text: v === "1" ? "TRUE" : "FALSE" };
          break;
        case "d": {
          const [y, mo, d] = (v ?? "").slice(0, 10).split("-").map(Number);
          cell = { text: v ?? "", date: { y: y!, m: mo!, d: d! } };
          break;
        }
        default:
          if (v === undefined) cell = { text: "" };
          else if (dateStyle[Number(a.s ?? 0)]) {
            const date = serialToDate(Number(v));
            cell = { text: `${date.d}/${date.m}/${date.y}`, date };
          } else cell = { text: numberText(v) };
      }
      row[col] = cell;
    }
    for (let i = 0; i < row.length; i++) row[i] ??= { text: "" };
    rows[rowNo - 1] = row;
  }
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return rows;
}

export interface SheetSpec {
  name: string;
  rows: string[][];
  /** Độ rộng từng cột (đơn vị ký tự). */
  widths?: number[];
  /** Dòng đầu là tiêu đề: in đậm, cố định khi cuộn. */
  header?: boolean;
  /** Danh sách chọn cho cột, ví dụ { 2: ["số", "trắc nghiệm"] }. */
  lists?: Record<number, string[]>;
}

/**
 * Ghi .xlsx. Mọi cột định dạng sẵn là Văn bản (@), nên thầy cô gõ 1/2 hay 0,5 vào bất kỳ ô
 * trống nào cũng được giữ nguyên, Excel không tự đổi thành ngày tháng hay số.
 */
export function writeXlsx(sheets: SheetSpec[]): Uint8Array {
  const enc = new TextEncoder();
  const xml = (s: string) => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  const files = [
    {
      name: "[Content_Types].xml",
      data: xml(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          sheets
            .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
            .join("") +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: xml(
        `<workbook ${NS} ${RNS}><sheets>` +
          sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
          `</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          sheets
            .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
            .join("") +
          `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      // Kiểu 0: mặc định. Kiểu 1: Văn bản, xuống dòng. Kiểu 2: Văn bản, đậm, nền xám (tiêu đề).
      name: "xl/styles.xml",
      data: xml(
        `<styleSheet ${NS}>` +
          `<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>` +
          `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
          `<fill><patternFill patternType="solid"><fgColor rgb="FFDDE6EE"/></patternFill></fill></fills>` +
          `<borders count="1"><border/></borders>` +
          `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
          `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
          `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
          `<xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
          `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      ),
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml(sheetXml(s, NS)) })),
  ];
  return writeZip(files);
}

function sheetXml(s: SheetSpec, ns: string): string {
  const ncol = Math.max(1, s.widths?.length ?? 0, ...s.rows.map((r) => r.length));
  const view = s.header
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  const cols =
    `<cols>` +
    Array.from({ length: ncol }, (_, c) => `<col min="${c + 1}" max="${c + 1}" width="${s.widths?.[c] ?? 14}" style="1" customWidth="1"/>`).join("") +
    `</cols>`;
  const rows = s.rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">` +
        r
          .map((v, ci) => {
            const style = s.header && ri === 0 ? 2 : 1;
            return `<c r="${colName(ci)}${ri + 1}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
          })
          .join("") +
        `</row>`,
    )
    .join("");
  const lists = Object.entries(s.lists ?? {});
  const validations = lists.length
    ? `<dataValidations count="${lists.length}">` +
      lists
        .map(
          ([c, items]) =>
            `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${colName(Number(c))}2:${colName(Number(c))}1000">` +
            `<formula1>"${escapeXml(items.join(","))}"</formula1></dataValidation>`,
        )
        .join("") +
      `</dataValidations>`
    : "";
  return `<worksheet ${ns}>${view}${cols}<sheetData>${rows}</sheetData>${validations}</worksheet>`;
}
