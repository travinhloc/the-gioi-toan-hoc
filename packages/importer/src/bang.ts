/**
 * Đổi bảng câu hỏi (mỗi dòng một câu) thành câu hỏi đúng schema nội dung, kèm danh sách vấn đề
 * ghi rõ dòng và cột để thầy cô sửa ngay trong Excel. Chấm đáp án bằng chính máy chấm của game.
 */
import { format, parseNumber, validateQuestion, type Question } from "@tgth/grader";
import { checkMath } from "./math";
import type { Cell } from "./xlsx";

export interface CauHoiNhap {
  id: string;
  bai?: string;
  loai: "so" | "trac-nghiem";
  de: string;
  luaChon?: string[];
  dapAn: string;
  goiY?: string;
  loiGiai?: string;
  loiSai?: string;
  doKho?: number;
}

export interface Issue {
  /** Số dòng như Excel hiển thị (dòng tiêu đề thường là 1). */
  row: number;
  column?: string;
  level: "loi" | "canh-bao";
  message: string;
}

export interface ImportContext {
  lop: number;
  chuong: number;
  /** Câu đã có trong bản phát hành của chương, để tránh trùng mã và trùng đề. */
  existing?: { id: string; de: string }[];
  /** Lỗi sai đã khai báo trong chương: mã → tên quái. */
  loiSai?: Record<string, { ten: string }>;
}

export interface ImportResult {
  /** Câu hợp lệ, theo thứ tự trong bảng. Dòng có lỗi không nằm ở đây. */
  cauHoi: { row: number; q: CauHoiNhap }[];
  issues: Issue[];
  /** Số dòng ví dụ (mã bắt đầu bằng VD) đã bỏ qua. */
  examples: number;
}

type Key = "id" | "bai" | "loai" | "de" | "dapAn" | "A" | "B" | "C" | "D" | "E" | "F" | "goiY" | "loiGiai" | "doKho" | "loiSai";

export const CHOICE_KEYS = ["A", "B", "C", "D", "E", "F"] as const;

/** Các cột của mẫu, theo thứ tự. `aliases` là cách gọi khác vẫn nhận (đã bỏ dấu, viết thường). */
export const COLUMNS: { key: Key; header: string; aliases: string[]; width: number; help: string }[] = [
  { key: "id", header: "Mã câu", aliases: ["ma", "ma cau", "ma cau hoi", "id"], width: 12, help: "Để trống thì tự đánh mã. Dòng có mã bắt đầu bằng VD là ví dụ, sẽ bị bỏ qua." },
  { key: "bai", header: "Bài", aliases: ["bai", "ten bai", "bai hoc"], width: 26, help: "Tên bài trong SGK, không bắt buộc." },
  { key: "loai", header: "Loại", aliases: ["loai", "loai cau", "dang"], width: 13, help: '"số" (học sinh gõ đáp án) hoặc "trắc nghiệm". Để trống thì tự đoán theo cột lựa chọn.' },
  { key: "de", header: "Đề bài", aliases: ["de", "de bai", "cau hoi", "noi dung"], width: 44, help: "Bắt buộc. Công thức đặt trong $...$, ví dụ $\\frac{1}{2}$." },
  { key: "dapAn", header: "Đáp án", aliases: ["dap an", "dapan", "ket qua"], width: 12, help: "Loại số: 5, -3, 0,5, 3/4 hoặc 1 1/2. Trắc nghiệm: chữ A, B, C..." },
  ...CHOICE_KEYS.map((k) => ({
    key: k,
    header: `Lựa chọn ${k}`,
    aliases: [`lua chon ${k.toLowerCase()}`, `phuong an ${k.toLowerCase()}`, `dap an ${k.toLowerCase()}`, k.toLowerCase()],
    width: 16,
    help: k === "A" ? "Chỉ cho câu trắc nghiệm, điền liền nhau từ A, ít nhất 2 lựa chọn." : "",
  })),
  { key: "goiY", header: "Gợi ý", aliases: ["goi y", "goiy"], width: 30, help: "Hiện khi học sinh trả lời sai, không bắt buộc." },
  { key: "loiGiai", header: "Lời giải", aliases: ["loi giai", "loigiai", "huong dan giai"], width: 36, help: "Không bắt buộc." },
  { key: "doKho", header: "Độ khó", aliases: ["do kho", "dokho", "muc do"], width: 9, help: "1 (dễ), 2 (vừa) hoặc 3 (khó)." },
  { key: "loiSai", header: "Lỗi sai hay gặp", aliases: ["loi sai", "loi sai hay gap", "loisai", "quai"], width: 18, help: "Mã hoặc tên quái lỗi sai đã khai báo cho chương (xem trang Lỗi sai), không bắt buộc." },
];

/** Bỏ dấu, viết thường, gộp khoảng trắng: "Đáp án (A–F)" → "dap an". */
export function fold(s: string): string {
  return s
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Đọc đáp án loại số, gỡ các kiểu Excel tự đổi. Trả về đáp án đã chuẩn hoá hoặc lỗi. */
export function fixNumberAnswer(cell: Cell): { value?: string; warning?: string; error?: string } {
  if (cell.date) {
    const { d, m, y } = cell.date;
    return {
      error:
        `Excel đã đổi ô này thành ngày ${d}/${m}/${y}. Có thể thầy cô gõ ${d}/${m} hoặc ${m}/${d}. ` +
        `Hãy định dạng cột Đáp án là Văn bản (Text) rồi gõ lại, hoặc gõ dấu ' trước phân số, ví dụ '1/2.`,
    };
  }
  const s = cell.text.replace(/^'/, "").replace(/^[–—]/, "-").replace(/\s+/g, " ").trim();
  const guessed = (value: string) => ({
    value,
    warning: `"${s}" là ngày tháng do Excel tự đổi, đã hiểu là ${value}. Thầy cô kiểm tra lại; dùng mẫu .xlsx thì cột Đáp án đã để sẵn dạng Văn bản.`,
  });

  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(s);
  if (dmy) return guessed(`${Number(dmy[1])}/${Number(dmy[2])}`);
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    return { error: `"${s}" là ngày tháng do Excel tự đổi, không đoán được phân số gốc. Hãy định dạng cột Đáp án là Văn bản rồi gõ lại.` };
  }
  // Excel tiếng Anh hiện 1/2 thành "2-Jan" (tháng/ngày) và 3/45 thành "Mar-45".
  const dMon = /^(\d{1,2})[-\s]([a-z]{3})$/i.exec(s);
  if (dMon && MONTHS.includes(dMon[2]!.toLowerCase())) return guessed(`${MONTHS.indexOf(dMon[2]!.toLowerCase()) + 1}/${Number(dMon[1])}`);
  const monY = /^([a-z]{3})[-\s](\d{2})$/i.exec(s);
  if (monY && MONTHS.includes(monY[1]!.toLowerCase())) return guessed(`${MONTHS.indexOf(monY[1]!.toLowerCase()) + 1}/${Number(monY[2])}`);

  if (s.endsWith("%")) return { error: `Đáp án phần trăm "${s}" chưa hỗ trợ. Ghi dạng số thập phân hoặc phân số, ví dụ 0,5 hoặc 1/2.` };
  const n = parseNumber(s);
  if (!n) {
    const thousands = /^[+-]?\d{1,3}([.,]\d{3}){2,}$|^[+-]?\d{1,3}(\.\d{3})+,\d+$|^[+-]?\d{1,3}(,\d{3})+\.\d+$/.test(s);
    return {
      error: thousands
        ? `Đáp án "${s}" có dấu ngăn cách hàng nghìn. Hãy viết liền, ví dụ 1000000 hoặc 1234,5.`
        : `Đáp án "${s}" chưa đọc được thành số. Viết dạng 5, -3, 0,5, 3/4 hoặc 1 1/2.`,
    };
  }
  const sep = /^[+-]?\d{1,3}([.,])\d{3}$/.exec(s);
  if (sep) {
    return {
      value: s,
      warning: `"${s}" được đọc là ${format(n).replace(".", ",")} (dấu ${sep[1] === "." ? "chấm" : "phẩy"} là dấu thập phân). Nếu ý là số nghìn thì viết liền, ví dụ ${s.replace(/[.,]/, "")}.`,
    };
  }
  return { value: s };
}

function choiceAnswer(raw: string, choices: string[]): { value?: string; warning?: string; error?: string } {
  const s = raw.trim();
  const up = s.toUpperCase().replace(/[.)]$/, "");
  if (/^[A-F]$/.test(up)) return { value: up };
  if (/^[1-6]$/.test(up)) {
    const letter = CHOICE_KEYS[Number(up) - 1]!;
    return { value: letter, warning: `Đáp án "${s}" được hiểu là lựa chọn ${letter}.` };
  }
  const idx = choices.findIndex((c) => c.trim() === s);
  if (idx >= 0) return { value: CHOICE_KEYS[idx]!, warning: `Đáp án ghi nguyên văn lựa chọn, đã đổi thành chữ ${CHOICE_KEYS[idx]}.` };
  return { error: `Đáp án trắc nghiệm "${s}" phải là chữ cái của lựa chọn đúng (A, B, C...).` };
}

function parseLoai(s: string): "so" | "trac-nghiem" | null | undefined {
  const f = fold(s);
  if (f === "") return undefined;
  if (["so", "dien so", "tu luan", "dien dap an", "nhap so"].includes(f)) return "so";
  if (["trac nghiem", "tn", "trac nghiem khach quan", "chon"].includes(f)) return "trac-nghiem";
  return null;
}

function parseDoKho(s: string): number | null | undefined {
  const f = fold(s);
  if (f === "") return undefined;
  if (/^[123]$/.test(f)) return Number(f);
  if (["de", "nhan biet"].includes(f)) return 1;
  if (["vua", "trung binh", "tb", "thong hieu"].includes(f)) return 2;
  if (["kho", "van dung", "van dung cao"].includes(f)) return 3;
  return null;
}

/** Lệnh LaTeX nằm ngoài $...$ thì sẽ hiện nguyên chữ "\frac" cho học sinh. */
function mathOutsideDollars(text: string): boolean {
  return text.split("$").some((part, i) => i % 2 === 0 && /\\[a-zA-Z]+|\^\{|_\{/.test(part));
}

/** "0,5" trong $...$ bị KaTeX hiểu là dấu phẩy liệt kê và giãn ra thành "0, 5". */
function decimalCommaInMath(text: string): boolean {
  return text.split("$").some((part, i) => i % 2 === 1 && /\d,\d/.test(part));
}

function sameText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Tìm dòng tiêu đề trong 10 dòng đầu: dòng đầu tiên có cả cột Đề bài và Đáp án. */
function findHeader(rows: Cell[][]): { at: number; map: Map<Key, number>; unknown: string[] } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const map = new Map<Key, number>();
    const unknown: string[] = [];
    (rows[r] ?? []).forEach((cell, c) => {
      const f = fold(cell.text);
      if (f === "") return;
      const col = COLUMNS.find((k) => k.aliases.includes(f) || fold(k.header) === f);
      if (col && !map.has(col.key)) map.set(col.key, c);
      else unknown.push(cell.text.trim());
    });
    if (map.has("de") && map.has("dapAn")) return { at: r, map, unknown };
  }
  return null;
}

export function importRows(rows: Cell[][], ctx: ImportContext): ImportResult {
  const issues: Issue[] = [];
  const header = findHeader(rows);
  if (!header) {
    issues.push({ row: 1, level: "loi", message: 'Không thấy dòng tiêu đề có cột "Đề bài" và "Đáp án". Hãy dùng mẫu, giữ nguyên dòng tiêu đề.' });
    return { cauHoi: [], issues, examples: 0 };
  }
  for (const name of header.unknown) issues.push({ row: header.at + 1, level: "canh-bao", message: `Cột "${name}" không thuộc mẫu, bị bỏ qua.` });

  const prefix = `l${ctx.lop}-c${ctx.chuong}-`;
  const existingIds = new Set((ctx.existing ?? []).map((q) => q.id));
  const seenDe = new Map<string, string>((ctx.existing ?? []).map((q) => [sameText(q.de), `câu ${q.id} đã có trong game`]));
  const seenIds = new Map<string, number>();
  const loiSaiByName = new Map(Object.entries(ctx.loiSai ?? {}).map(([ma, l]) => [fold(l.ten), ma]));

  const out: { row: number; q: Omit<CauHoiNhap, "id"> & { id?: string } }[] = [];
  let examples = 0;

  for (let r = header.at + 1; r < rows.length; r++) {
    const row = r + 1;
    const cells = rows[r] ?? [];
    const cell = (k: Key): Cell => cells[header.map.get(k) ?? -1] ?? { text: "" };
    const text = (k: Key) => cell(k).text.replace(/\u00a0/g, " ").trim();
    if (cells.every((c) => c.text.trim() === "")) continue;

    const rawId = text("id");
    if (/^vd/i.test(rawId)) {
      examples++;
      continue;
    }
    const before = issues.length;
    const err = (column: string, message: string) => issues.push({ row, column, level: "loi", message });
    const warn = (column: string, message: string) => issues.push({ row, column, level: "canh-bao", message });

    const de = text("de");
    if (de === "") err("Đề bài", "Thiếu đề bài.");

    const choices: string[] = [];
    let gap = false;
    for (const k of CHOICE_KEYS) {
      const v = text(k);
      if (v === "") gap = choices.length > 0 || gap;
      else {
        if (gap || (choices.length === 0 && k !== "A")) err(`Lựa chọn ${k}`, "Các lựa chọn phải điền liền nhau, bắt đầu từ A.");
        choices.push(v);
      }
    }

    let loai = parseLoai(text("loai"));
    if (loai === null) {
      err("Loại", `Loại "${text("loai")}" không rõ. Ghi "số" hoặc "trắc nghiệm".`);
      loai = undefined;
    }
    loai ??= choices.length > 0 ? "trac-nghiem" : "so";
    if (loai === "so" && choices.length > 0) warn("Lựa chọn A", "Câu loại số nên các lựa chọn bị bỏ qua.");

    let dapAn = "";
    if (text("dapAn") === "" && !cell("dapAn").date) err("Đáp án", "Thiếu đáp án.");
    else {
      const fixed = loai === "so" ? fixNumberAnswer(cell("dapAn")) : choiceAnswer(text("dapAn"), choices);
      if (fixed.error) err("Đáp án", fixed.error);
      if (fixed.warning) warn("Đáp án", fixed.warning);
      dapAn = fixed.value ?? "";
    }
    if (dapAn !== "") {
      const gq: Question = loai === "trac-nghiem" ? { loai, luaChon: choices, dapAn } : { loai, dapAn };
      for (const msg of validateQuestion(gq)) err(loai === "trac-nghiem" && msg.includes("lựa chọn") ? "Lựa chọn A" : "Đáp án", msg);
    }

    const doKho = parseDoKho(text("doKho"));
    if (doKho === null) err("Độ khó", `Độ khó "${text("doKho")}" không rõ. Ghi 1, 2 hoặc 3.`);

    let loiSai: string | undefined;
    const rawLoi = text("loiSai");
    if (rawLoi !== "") {
      const ma = rawLoi.toLowerCase();
      loiSai = ctx.loiSai?.[ma] ? ma : loiSaiByName.get(fold(rawLoi));
      if (!loiSai) {
        const known = Object.keys(ctx.loiSai ?? {});
        err(
          "Lỗi sai hay gặp",
          known.length
            ? `Lỗi sai "${rawLoi}" chưa khai báo cho chương. Chọn một trong: ${known.join(", ")}.`
            : `Chương này chưa khai báo lỗi sai nào, nên để trống cột này.`,
        );
      }
    }

    const texts: [string, string][] = [
      ["Đề bài", de],
      ["Gợi ý", text("goiY")],
      ["Lời giải", text("loiGiai")],
      ...(loai === "trac-nghiem" ? choices.map((c, i): [string, string] => [`Lựa chọn ${CHOICE_KEYS[i]}`, c]) : []),
    ];
    for (const [col, t] of texts) {
      if (t === "") continue;
      const math = checkMath(t);
      for (const msg of math) err(col, msg);
      if (math.length === 0 && mathOutsideDollars(t)) warn(col, "Có lệnh công thức nằm ngoài $...$, học sinh sẽ thấy nguyên chữ. Đặt công thức trong $...$.");
      if (decimalCommaInMath(t)) warn(col, "Số thập phân trong $...$ nên viết 0{,}5 thay cho 0,5, nếu không sẽ hiện giãn thành \"0, 5\".");
    }

    let id: string | undefined;
    if (rawId !== "") {
      id = rawId.toLowerCase();
      if (!/^l[6-9]-c[0-9]{1,2}-[0-9]{4}$/.test(id) || !id.startsWith(prefix)) {
        err("Mã câu", `Mã "${rawId}" phải có dạng ${prefix}0001. Để trống thì tự đánh mã.`);
      } else if (existingIds.has(id)) {
        err("Mã câu", `Mã ${id} đã có trong game. Mã đã phát hành không dùng lại; để trống để lấy mã mới.`);
      } else if (seenIds.has(id)) {
        err("Mã câu", `Mã ${id} trùng với dòng ${seenIds.get(id)}.`);
      }
      seenIds.set(id, row);
    }

    if (de !== "") {
      const dup = seenDe.get(sameText(de));
      if (dup) warn("Đề bài", `Đề giống hệt ${dup}.`);
      else seenDe.set(sameText(de), `dòng ${row}`);
    }

    if (issues.slice(before).some((i) => i.level === "loi")) continue;
    out.push({
      row,
      q: {
        id,
        bai: text("bai") || undefined,
        loai,
        de,
        luaChon: loai === "trac-nghiem" ? choices : undefined,
        dapAn,
        goiY: text("goiY") || undefined,
        loiGiai: text("loiGiai") || undefined,
        loiSai,
        doKho: doKho ?? undefined,
      },
    });
  }

  // Đánh mã cho dòng để trống, tiếp sau mã lớn nhất đã dùng (kể cả mã của dòng lỗi, để khỏi đụng sau khi sửa).
  let next = 1;
  for (const id of [...existingIds, ...seenIds.keys()]) {
    if (id.startsWith(prefix)) next = Math.max(next, Number(id.slice(prefix.length)) + 1);
  }
  const cauHoi: ImportResult["cauHoi"] = [];
  for (const { row, q } of out) {
    const { id: given, ...rest } = q;
    let id = given;
    if (!id) {
      if (next > 9999) {
        issues.push({ row, column: "Mã câu", level: "loi", message: "Chương đã hết mã (quá 9999 câu)." });
        continue;
      }
      id = `${prefix}${String(next++).padStart(4, "0")}`;
    }
    // Giữ thứ tự khoá giống file YAML viết tay, bỏ các trường trống.
    const full: CauHoiNhap = { id, ...rest };
    cauHoi.push({ row, q: Object.fromEntries(Object.entries(full).filter(([, v]) => v !== undefined)) as unknown as CauHoiNhap });
  }
  issues.sort((a, b) => a.row - b.row);
  return { cauHoi, issues, examples };
}
