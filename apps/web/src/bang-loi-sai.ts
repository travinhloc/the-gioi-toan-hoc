import { buildBoard, decodeMission, encodeMission, decodeResult, findResultCodes, hashKey, type Board, type KetQua, type Mission } from "@tgth/engine";
import { loadBank, type LoiSai } from "./content";
import { renderMathText } from "./math";

/**
 * Bảng lỗi sai: thầy cô dán mã nhiệm vụ và cả đoạn chat Zalo có mã kết quả của các em.
 * Mọi thứ tính trên máy này; đoạn đã dán chỉ lưu trong trình duyệt của thầy cô.
 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("board-form");
const missionInput = form.elements.namedItem("nv") as HTMLInputElement;
const pasteInput = form.elements.namedItem("kq") as HTMLTextAreaElement;
const errorEl = $("board-error");
const boardEl = $("board");

const KEY = "tgth.gv.ketqua.";

interface Names {
  loi: Map<number, LoiSai>;
  bai: Map<number, string>;
}

let current: { mission: Mission; board: Board; names: Names } | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), { textContent: text });
}

/** Dò ngược mã băm trong mã kết quả về tên quái và tên bài, bằng nội dung của lớp. */
async function loadNames(lop: number): Promise<Names> {
  const { bank, loiSai } = await loadBank(lop);
  const loi = new Map<number, LoiSai>();
  for (const [ma, l] of Object.entries(loiSai)) loi.set(hashKey(ma), l);
  for (const q of bank) {
    if (!q.loiSai) loi.set(hashKey(q.id), { ten: `Quái lỗi sai câu ${q.id}`, moTa: q.de });
  }
  const bai = new Map(bank.map((q) => [hashKey(q.bai ?? ""), q.bai ?? "(chưa ghi bài)"]));
  return { loi, bai };
}

const loiName = (names: Names, key: number) => names.loi.get(key)?.ten ?? "Lỗi không rõ (nội dung đã đổi)";
const baiName = (names: Names, key: number) => names.bai.get(key) ?? "Bài không rõ (nội dung đã đổi)";
const tongDung = (k: KetQua) => k.bai.reduce((n, b) => n + b.dung, 0);
const tongSai = (k: KetQua) => k.bai.reduce((n, b) => n + b.sai, 0);
const list = (stt: readonly number[]) => (stt.length ? stt.map((s) => `số ${s}`).join(", ") : "không em nào");

function table(head: string[], rows: (string | number)[][]): HTMLTableElement {
  const t = el("table");
  const tr = t.createTHead().insertRow();
  for (const h of head) tr.append(el("th", h));
  const body = t.createTBody();
  for (const row of rows) {
    const r = body.insertRow();
    for (const cell of row) r.insertCell().textContent = String(cell);
  }
  return t;
}

function render(mission: Mission, board: Board, names: Names, khac: number, hong: number): void {
  const xong = board.hocSinh.filter((k) => tongDung(k) >= mission.soCau).length;
  const notes = [
    `Đã nhận kết quả của ${board.hocSinh.length} em, ${xong} em xong nhiệm vụ (đào đúng ${mission.soCau} câu).`,
    khac ? `Bỏ qua ${khac} mã của nhiệm vụ khác.` : "",
    hong ? `Bỏ qua ${hong} mã bị gõ nhầm hoặc bị cắt.` : "",
  ];

  const loiList = el("div");
  loiList.className = "board-loi";
  for (const row of board.loi) {
    const d = el("details");
    d.append(
      el(
        "summary",
        `${loiName(names, row.key)}: ${row.mac.length} em mắc, ${row.mac.length - row.canHoTro.length} em đã thu phục`,
      ),
    );
    const moTa = el("p");
    renderMathText(moTa, names.loi.get(row.key)?.moTa ?? "");
    d.append(moTa, el("p", `Cần thầy cô hỗ trợ (chưa thu phục): ${list(row.canHoTro)}.`), el("p", `Đã mắc: ${list(row.mac)}.`));
    loiList.append(d);
  }
  if (board.loi.length === 0) loiList.append(el("p", "Chưa em nào mắc lỗi sai."));

  boardEl.replaceChildren(
    ...notes.filter(Boolean).map((n) => el("p", n)),
    el("h3", "Lỗi sai (bấm để xem số thứ tự các em)"),
    loiList,
    el("h3", "Theo bài"),
    table(
      ["Bài", "Số em", "Đúng", "Sai", "Tỉ lệ đúng"],
      board.bai.map((b) => [baiName(names, b.key), b.soEm, b.dung, b.sai, `${Math.round((100 * b.dung) / (b.dung + b.sai))}%`]),
    ),
    el("h3", "Từng em"),
    table(
      ["Số thứ tự", "Đúng", "Sai", "Xong", "Lỗi chưa thu phục"],
      board.hocSinh.map((k) => [
        k.stt,
        tongDung(k),
        tongSai(k),
        tongDung(k) >= mission.soCau ? "✓" : "",
        k.loi.filter((l) => !l.thuPhuc).map((l) => loiName(names, l.key)).join("; "),
      ]),
    ),
    csvButtons(),
    Object.assign(el("p", "Mã kết quả chỉ chống gõ nhầm, không chống làm giả: dùng để biết lớp yếu ở đâu, không dùng để chấm điểm."), {
      className: "muted",
    }),
  );
  boardEl.hidden = false;
}

function csvButtons(): HTMLParagraphElement {
  const p = el("p");
  const loi = el("button", "Tải CSV lỗi sai");
  loi.type = "button";
  loi.onclick = () => download("bang-loi-sai.csv", csvLoi());
  const hs = el("button", "Tải CSV từng em");
  hs.type = "button";
  hs.onclick = () => download("ket-qua-tung-em.csv", csvHocSinh());
  p.append(loi, " ", hs);
  return p;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(rows: (string | number)[][]): string {
  // BOM để Excel trên Windows đọc đúng tiếng Việt.
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

function csvLoi(): string {
  const { board, names } = current!;
  return csv([
    ["Lỗi sai", "Mô tả", "Số em mắc", "Số em đã thu phục", "Cần hỗ trợ (số thứ tự)", "Đã mắc (số thứ tự)"],
    ...board.loi.map((r) => [
      loiName(names, r.key),
      (names.loi.get(r.key)?.moTa ?? "").replace(/\$/g, ""),
      r.mac.length,
      r.mac.length - r.canHoTro.length,
      r.canHoTro.join(" "),
      r.mac.join(" "),
    ]),
  ]);
}

function csvHocSinh(): string {
  const { board, names, mission } = current!;
  return csv([
    ["Số thứ tự", "Đúng", "Sai", "Xong nhiệm vụ", "Lỗi chưa thu phục", "Lỗi đã thu phục"],
    ...board.hocSinh.map((k) => [
      k.stt,
      tongDung(k),
      tongSai(k),
      tongDung(k) >= mission.soCau ? "có" : "chưa",
      k.loi.filter((l) => !l.thuPhuc).map((l) => loiName(names, l.key)).join("; "),
      k.loi.filter((l) => l.thuPhuc).map((l) => loiName(names, l.key)).join("; "),
    ]),
  ]);
}

function download(name: string, text: string): void {
  const a = el("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function remember(missionCode: string, text: string): void {
  try {
    localStorage.setItem(KEY + missionCode, text);
    localStorage.setItem(KEY + "last", missionCode);
  } catch {
    // Không lưu được thì lần sau dán lại.
  }
}

function recall(key: string): string {
  try {
    return localStorage.getItem(KEY + key) ?? "";
  } catch {
    return "";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const m = decodeMission(missionInput.value);
  if (!m.ok) {
    errorEl.textContent = m.error.replace("em kiểm tra", "thầy cô kiểm tra");
    return;
  }
  const codes = findResultCodes(pasteInput.value);
  const decoded = codes.map(decodeResult);
  const ok = decoded.flatMap((r) => (r.ok ? [r.ketQua] : []));
  const mine = ok.filter((k) => k.missionId === m.mission.id);
  if (mine.length === 0) {
    errorEl.textContent = codes.length
      ? "Chưa có mã kết quả nào của nhiệm vụ này. Thầy cô kiểm tra lại mã nhiệm vụ."
      : "Chưa thấy mã kết quả nào (dạng KQ-...) trong đoạn đã dán.";
    boardEl.hidden = true;
    return;
  }
  errorEl.textContent = "Đang tải nội dung để dò tên lỗi sai...";
  remember(encodeMission(m.mission), pasteInput.value);
  loadNames(m.mission.lop)
    .then((names) => {
      errorEl.textContent = "";
      const board = buildBoard(mine);
      current = { mission: m.mission, board, names };
      render(m.mission, board, names, ok.length - mine.length, decoded.length - ok.length);
    })
    .catch((err: Error) => {
      errorEl.textContent = `Không tải được nội dung: ${err.message}`;
    });
});

// Mở lại trang thì điền sẵn nhiệm vụ và đoạn đã dán lần trước, để dán thêm tin nhắn mới.
missionInput.addEventListener("change", () => {
  const m = decodeMission(missionInput.value);
  if (m.ok && !pasteInput.value) pasteInput.value = recall(encodeMission(m.mission));
});
const last = recall("last");
if (last) {
  missionInput.value = last;
  pasteInput.value = recall(last);
}
