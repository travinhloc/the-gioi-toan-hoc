import { grade } from "@tgth/grader";
import {
  chapterYaml,
  importRows,
  questionsYaml,
  readFile,
  readPasted,
  templateCsv,
  templateXlsx,
  type CauHoiNhap,
  type ImportContext,
  type Table,
} from "@tgth/importer";
import { loadChapter, loadIndex, type ContentIndex, type LoiSai } from "./content";
import { renderMathText } from "./math";
import "@fontsource/noto-sans-mono/latin-400.css";
import "@fontsource/noto-sans-mono/vietnamese-400.css";
import "./style.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const chapterEl = $<HTMLSelectElement>("chapter");
const newChapterEl = $("new-chapter");
const fileEl = $<HTMLInputElement>("file");
const dropEl = $("drop");
const resultEl = $("result");

const NEW = "moi";
let index: ContentIndex | null = null;
let table: Table | null = null;
let tableName = "";
let yamlText = "";
/** Dữ liệu chương đang chọn, tải một lần cho mỗi chương. */
const chapterCache = new Map<string, Promise<{ existing: { id: string; de: string }[]; loiSai: Record<string, LoiSai> }>>();

interface Target {
  lop: number;
  chuong: number;
  ten: string;
  isNew: boolean;
  file?: string;
  existing: { id: string; de: string }[];
  loiSai: Record<string, LoiSai>;
}

function slug(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function target(): Promise<Target> {
  if (chapterEl.value === NEW || !index) {
    const lop = Number($<HTMLInputElement>("new-lop").value);
    const chuong = Number($<HTMLInputElement>("new-chuong").value);
    if (!(lop >= 6 && lop <= 9) || !(chuong >= 1 && chuong <= 20)) throw new Error("Lớp phải từ 6 đến 9, chương từ 1 đến 20.");
    const ten = $<HTMLInputElement>("new-ten").value.trim() || `Chương ${chuong}`;
    const dup = index?.chuong.find((c) => c.lop === lop && c.chuong === chuong);
    if (dup) throw new Error(`Lớp ${lop} chương ${chuong} đã có (${dup.ten}). Hãy chọn chương đó trong danh sách.`);
    return { lop, chuong, ten, isNew: true, existing: [], loiSai: {} };
  }
  const c = index.chuong[Number(chapterEl.value)]!;
  if (!chapterCache.has(c.path)) {
    chapterCache.set(
      c.path,
      loadChapter(c.path).then((f) => ({ existing: f.cauHoi.map((q) => ({ id: q.id, de: q.de })), loiSai: f.loiSai ?? {} })),
    );
  }
  const data = await chapterCache.get(c.path)!;
  return { lop: c.lop, chuong: c.chuong, ten: c.ten, isNew: false, file: `content/lop-${c.lop}/chuong-${String(c.chuong).padStart(2, "0")}-...yaml`, ...data };
}

function download(name: string, data: Uint8Array | string, type: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderChapters(): void {
  const options = (index?.chuong ?? []).map((c, i) => new Option(`Lớp ${c.lop} · Chương ${c.chuong}: ${c.ten} (${c.soCau} câu)`, String(i)));
  chapterEl.replaceChildren(...options, new Option("Chương mới chưa có trong game...", NEW));
  newChapterEl.hidden = chapterEl.value !== NEW;
}

function previewItem(q: CauHoiNhap, row: number): HTMLLIElement {
  const li = document.createElement("li");
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = [`${q.id} · dòng ${row}`, q.bai, q.doKho ? `độ khó ${q.doKho}` : "", q.loiSai ? `lỗi sai: ${q.loiSai}` : ""].filter(Boolean).join(" · ");
  const de = document.createElement("div");
  renderMathText(de, q.de);
  li.append(meta, de);
  if (q.luaChon) {
    const ol = document.createElement("ol");
    ol.className = "choices";
    for (const c of q.luaChon) {
      const item = document.createElement("li");
      renderMathText(item, c);
      ol.append(item);
    }
    li.append(ol);
  }
  const tryEl = document.createElement("div");
  tryEl.className = "try";
  const input = Object.assign(document.createElement("input"), { placeholder: q.loai === "so" ? "gõ đáp án" : "A, B, C...", ariaLabel: "Thử đáp án" });
  const button = Object.assign(document.createElement("button"), { type: "button", textContent: "Chấm thử" });
  const out = document.createElement("span");
  const answer = q.loai === "so" ? q.dapAn : `${q.dapAn}`;
  button.addEventListener("click", () => {
    const r = grade(q.loai === "so" ? { loai: "so", dapAn: q.dapAn } : { loai: "trac-nghiem", luaChon: q.luaChon ?? [], dapAn: q.dapAn }, input.value);
    out.className = r.ok ? "ok" : "error";
    out.textContent = r.ok ? "Đúng" : r.reason === "sai" ? `Sai, đáp án là ${r.expected}` : "Máy chấm không đọc được câu trả lời này";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") button.click();
  });
  const key = document.createElement("span");
  key.className = "muted";
  key.textContent = `Đáp án: ${answer}`;
  tryEl.append(input, button, out, key);
  li.append(tryEl);
  if (q.goiY || q.loiGiai) {
    const extra = document.createElement("div");
    extra.className = "muted";
    renderMathText(extra, [q.goiY && `Gợi ý: ${q.goiY}`, q.loiGiai && `Lời giải: ${q.loiGiai}`].filter(Boolean).join("  ·  "));
    li.append(extra);
  }
  return li;
}

async function check(): Promise<void> {
  if (!table) return;
  resultEl.hidden = false;
  const summary = $("summary");
  const notes = $("notes");
  const tbody = $("issues").querySelector("tbody")!;
  let t: Target;
  try {
    t = await target();
  } catch (err) {
    summary.textContent = (err as Error).message;
    notes.replaceChildren();
    $("issues").hidden = true;
    $("output").hidden = true;
    return;
  }
  const ctx: ImportContext = { lop: t.lop, chuong: t.chuong, existing: t.existing, loiSai: t.loiSai };
  const r = importRows(table.rows, ctx);
  const nLoi = new Set(r.issues.filter((i) => i.level === "loi").map((i) => i.row)).size;
  const nCanh = r.issues.filter((i) => i.level === "canh-bao").length;

  summary.textContent =
    `${tableName ? `${tableName}: ` : ""}${table.source}. ` +
    `${r.cauHoi.length} câu hợp lệ` +
    (nLoi ? `, ${nLoi} dòng có lỗi chưa đưa vào` : "") +
    (nCanh ? `, ${nCanh} cảnh báo nên xem lại` : "") +
    (r.examples ? `, bỏ qua ${r.examples} dòng ví dụ` : "") +
    "." +
    (r.cauHoi.length === 0 && nLoi === 0 ? " Thêm câu hỏi vào các dòng dưới dòng tiêu đề (để trống cột Mã câu) rồi chọn lại file." : "");
  notes.replaceChildren(...table.warnings.map((w) => Object.assign(document.createElement("li"), { textContent: w })));

  $("issues").hidden = r.issues.length === 0;
  tbody.replaceChildren(
    ...r.issues.map((i) => {
      const tr = document.createElement("tr");
      tr.className = i.level;
      for (const v of [String(i.row), i.column ?? "", `${i.level === "loi" ? "Lỗi" : "Cảnh báo"}: ${i.message}`]) {
        tr.append(Object.assign(document.createElement("td"), { textContent: v }));
      }
      return tr;
    }),
  );

  $("output").hidden = r.cauHoi.length === 0;
  $("preview").replaceChildren(...r.cauHoi.map(({ q, row }) => previewItem(q, row)));
  const qs = r.cauHoi.map((x) => x.q);
  yamlText = t.isNew ? chapterYaml({ lop: t.lop, chuong: t.chuong, ten: t.ten }, qs) : questionsYaml(qs);
  $<HTMLTextAreaElement>("yaml").value = yamlText;
  $("yaml-help").textContent = t.isNew
    ? `Đây là cả file chương mới. Lưu thành content/lop-${t.lop}/chuong-${String(t.chuong).padStart(2, "0")}-${slug(t.ten)}.yaml.`
    : `Dán đoạn này vào cuối danh sách cauHoi trong ${t.file}. Mã câu đã được đánh tiếp sau ${t.existing.length} câu đang có.`;
  $<HTMLButtonElement>("dl-yaml").dataset.name = t.isNew
    ? `chuong-${String(t.chuong).padStart(2, "0")}-${slug(t.ten)}.yaml`
    : `lop-${t.lop}-chuong-${t.chuong}-them.yaml`;
}

async function useFile(file: File): Promise<void> {
  tableName = file.name;
  try {
    table = await readFile(file.name, new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    table = null;
    resultEl.hidden = false;
    $("summary").textContent = (err as Error).message;
    $("notes").replaceChildren();
    $("issues").hidden = true;
    $("output").hidden = true;
    return;
  }
  await check();
}

async function templateOptions() {
  const t = await target();
  return { lop: t.lop, chuong: t.chuong, ten: t.ten, loiSai: t.loiSai };
}

chapterEl.addEventListener("change", () => {
  newChapterEl.hidden = chapterEl.value !== NEW;
  void check();
});
newChapterEl.addEventListener("change", () => void check());

$("dl-xlsx").addEventListener("click", () => {
  void templateOptions()
    .then((o) => download(`mau-cau-hoi-lop-${o.lop}-chuong-${o.chuong}.xlsx`, templateXlsx(o), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
    .catch((err: Error) => alert(err.message));
});
$("dl-csv").addEventListener("click", () => {
  void templateOptions()
    .then((o) => download(`mau-cau-hoi-lop-${o.lop}-chuong-${o.chuong}.csv`, templateCsv(o), "text/csv;charset=utf-8"))
    .catch((err: Error) => alert(err.message));
});

fileEl.addEventListener("change", () => {
  const f = fileEl.files?.[0];
  if (f) void useFile(f);
  fileEl.value = "";
});
dropEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropEl.classList.add("over");
});
dropEl.addEventListener("dragleave", () => dropEl.classList.remove("over"));
dropEl.addEventListener("drop", (e) => {
  e.preventDefault();
  dropEl.classList.remove("over");
  const f = e.dataTransfer?.files[0];
  if (f) void useFile(f);
});
$("check-paste").addEventListener("click", () => {
  const text = $<HTMLTextAreaElement>("paste").value;
  if (text.trim() === "") return;
  tableName = "";
  table = readPasted(text);
  void check();
});

$("dl-yaml").addEventListener("click", (e) => {
  download((e.currentTarget as HTMLElement).dataset.name ?? "cau-hoi.yaml", yamlText, "text/yaml;charset=utf-8");
});
$("copy-yaml").addEventListener("click", (e) => {
  const button = e.currentTarget as HTMLButtonElement;
  navigator.clipboard.writeText(yamlText).then(
    () => (button.textContent = "Đã chép"),
    () => $<HTMLTextAreaElement>("yaml").select(),
  );
});

loadIndex()
  .then((i) => {
    index = i;
    renderChapters();
  })
  .catch(() => {
    // Không tải được bản phát hành (mất mạng): vẫn soạn được chương mới.
    index = null;
    renderChapters();
  });
