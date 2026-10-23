import {
  acceptMission,
  answer,
  blockAt,
  canCraft,
  cancelPending,
  craftRecipe,
  currentQuestion,
  decodeMission,
  encodeMission,
  encodeResult,
  fight,
  isNight,
  mine,
  missionFromHash,
  monsterOf,
  monsters,
  move,
  newGame,
  RECIPES,
  resultOf,
  sleep,
  startDay,
  SUN_MAX,
  walkTo,
  type Block,
  type GameState,
  type Item,
} from "@tgth/engine";
import { choiceLetter } from "@tgth/grader";
import { loadBank, type ContentQuestion, type LoiSai } from "./content";
import { answerTex, KEYS as PAD_KEYS } from "./keypad";
import { renderMathText } from "./math";
import { loadSave, loadStt, writeSave, writeStt } from "./save";
import katex from "katex";
import "@fontsource/noto-sans-mono/latin-400.css";
import "@fontsource/noto-sans-mono/latin-700.css";
import "@fontsource/noto-sans-mono/vietnamese-400.css";
import "@fontsource/noto-sans-mono/vietnamese-700.css";
import "./style.css";

const GLYPH: Record<Block, string> = { khong: " ", dat: "▒", da: "▓", go: "♣", quang: "◆" };
const BLOCK_NAME: Record<Block, string> = { khong: "trống", dat: "đất", da: "đá", go: "gỗ", quang: "quặng ◆" };
const ITEM_NAME: Record<Item, string> = {
  go: "Gỗ",
  da: "Đá",
  dat: "Đất",
  quang: "Quặng",
  "da-sang": "Đá Sáng",
  "cuoc-go": "Cuốc gỗ",
  "cuoc-da": "Cuốc đá",
  duoc: "Đuốc",
  "dong-ho-cat": "Đồng hồ cát",
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
const DIR_NAME = { up: "phía trên", down: "phía dưới", left: "bên trái", right: "bên phải" } as const;
type Dir = keyof typeof DIRS;
/** Ô nhỏ nhất để chạm trúng bằng ngón tay; màn hẹp thì lưới chỉ hiện quanh @ và cuộn theo. */
const MIN_CELL = 22;
const MAX_CELL = 40;
/** Nhật ký chỉ giữ hai dòng, thay cho mọi thông báo bật lên. */
const LOG_LINES = 2;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const worldEl = $("world");
const nearbyEl = $("nearby");
const statusEl = $("status");
const logEl = $<HTMLOListElement>("log");
const phaseEl = $("phase");
const inventoryEl = $<HTMLUListElement>("inventory");
const recipesEl = $("recipes");
const notebookEl = $<HTMLUListElement>("notebook");
const missionEl = $("mission");
const mailBadge = $("mail-badge");
const missionForm = $<HTMLFormElement>("mission-form");
const sheet = $<HTMLDialogElement>("question");
const qForm = $<HTMLFormElement>("question-form");
const qTitle = $("question-title");
const qText = $("question-text");
const qChoices = $("question-choices");
const qAnswer = $("question-answer");
const qInput = $<HTMLInputElement>("question-input");
const qPreview = $("question-preview");
const qFeedback = $("question-feedback");
const qSubmit = $<HTMLButtonElement>("question-submit");
const keypadEl = $("keypad");
const reviewEl = $("question-review");

let state: GameState = loadSave() ?? newGame(Date.now() % 100000);
let bank: ContentQuestion[] = [];
let loiSai: Record<string, LoiSai> = {};
let facing: Dir = "right";
const log: string[] = [];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", props: Partial<HTMLElementTagNameMap[K]> = {}) {
  return Object.assign(document.createElement(tag), { textContent: text }, props);
}

/** Thêm một dòng nhật ký (có thể chứa công thức $...$); chỉ hai dòng mới nhất còn lại. */
function say(line: string): void {
  log.push(line);
  log.splice(0, log.length - LOG_LINES);
  logEl.replaceChildren(
    ...log.map((l) => {
      const li = el("li");
      renderMathText(li, l);
      return li;
    }),
  );
}

/** Tên quái của một mã lỗi; câu chưa gắn lỗi sai thì gọi chung. */
function monsterName(loi: string): string {
  return loiSai[loi]?.ten ?? "Quái lỗi sai";
}

function statusLine(): string {
  if (state.phase === "ngay") return `Ngày ${state.day} · ☼ ${"▮".repeat(state.sun)}${"▯".repeat(SUN_MAX - state.sun)}`;
  if (state.phase === "dem") return `Đêm ${state.day} · ${monsters(state).length} quái lỗi sai`;
  return `Sáng ngày ${state.day + 1}`;
}

function render(): void {
  document.body.classList.toggle("night", isNight(state));
  statusEl.textContent = statusLine();
  renderWorld();
  renderNearby();
  renderPhase();
  renderNotebook();
  renderMission();
  renderCraft();
}

/** Chọn cỡ ô và khung nhìn: vừa màn hình, ô không nhỏ hơn MIN_CELL, @ luôn ở giữa nếu được. */
function viewport() {
  const { world, player } = state;
  const w = worldEl.clientWidth;
  const h = worldEl.clientHeight;
  const cols = Math.min(world.width, Math.max(8, Math.floor(w / MIN_CELL)));
  const rows = Math.min(world.height, Math.max(6, Math.floor(h / MIN_CELL)));
  const cell = Math.max(12, Math.min(MAX_CELL, Math.floor(Math.min(w / cols, h / rows))));
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  const x0 = clamp(player.x - Math.floor(cols / 2), world.width - cols);
  const y0 = clamp(player.y - Math.floor(rows / 2), world.height - rows);
  return { cols, rows, cell, x0, y0 };
}

function renderWorld(): void {
  const { world, player } = state;
  const { cols, rows, cell, x0, y0 } = viewport();
  const grid = el("div", "", { className: "grid" });
  grid.style.setProperty("--cols", String(cols));
  grid.style.setProperty("--cell", `${cell}px`);
  for (let y = y0; y < y0 + rows; y++) {
    for (let x = x0; x < x0 + cols; x++) {
      const isPlayer = x === player.x && y === player.y;
      const block = blockAt(world, x, y) ?? "khong";
      const c = el("span", isPlayer ? "@" : GLYPH[block], { className: isPlayer ? "c me" : `c b-${block}` });
      c.dataset.x = String(x);
      c.dataset.y = String(y);
      grid.append(c);
    }
  }
  worldEl.replaceChildren(grid);
}

/** Trình đọc màn hình đọc bốn khối quanh @ (kèm nút đào) thay vì cả lưới. */
function renderNearby(): void {
  if (state.phase !== "ngay") {
    nearbyEl.replaceChildren();
    return;
  }
  const { x, y } = state.player;
  nearbyEl.replaceChildren(
    ...(Object.keys(DIRS) as Dir[]).map((d) => {
      const [dx, dy] = DIRS[d];
      const block = blockAt(state.world, x + dx, y + dy);
      if (!block) return el("p", `${DIR_NAME[d]}: hết bản đồ`);
      const verb = block === "khong" ? "Đi" : "Đào";
      return el("button", `${verb} ${DIR_NAME[d]}: ${BLOCK_NAME[block]}`, { onclick: () => step(d) });
    }),
  );
}

function renderPhase(): void {
  if (state.phase === "ngay") {
    phaseEl.replaceChildren();
  } else if (state.phase === "dem") {
    phaseEl.replaceChildren(
      ...monsters(state).map((m) =>
        el("button", `Đấu ${monsterName(m.loi)}`, { onclick: () => update(fight(state, m.loi, bank)) }),
      ),
      el("button", "Đi ngủ", { className: "quiet", onclick: () => update(sleep(state)) }),
    );
  } else {
    const t = state.today;
    phaseEl.replaceChildren(
      el("p", `> Hôm qua đào đúng ${t.dung} câu, sai ${t.sai} câu.`),
      el("p", `> Đêm qua thu phục ${t.thuPhuc} quái, ${t.chayThoat} quái chạy thoát.`),
      el("p", `> Sổ Tay còn theo dõi ${state.notebook.length} lỗi.`),
      el("button", "Bắt đầu ngày mới", { className: "primary", onclick: () => update(startDay(state)) }),
    );
  }
}

function renderCraft(): void {
  const items = Object.entries(state.inventory).filter(([, n]) => n && n > 0);
  inventoryEl.replaceChildren(
    ...items.map(([item, n]) => el("li", `${ITEM_NAME[item as Item]}: ${n}`)),
  );
  if (items.length === 0) inventoryEl.replaceChildren(el("li", "Túi còn trống. Đào đất, đá, gỗ để có nguyên liệu."));
  recipesEl.replaceChildren(
    ...RECIPES.map((r) =>
      el("button", r.ten, {
        disabled: !canCraft(state.inventory, r),
        onclick: () => {
          update(craftRecipe(state, r.id));
          say(`Đã làm ${r.ten}.`);
        },
      }),
    ),
  );
}

function renderNotebook(): void {
  notebookEl.replaceChildren(
    ...state.notebook.map((e) => {
      const wait = e.due - state.day;
      const when = wait <= 0 ? "đêm nay" : `sau ${wait} ngày`;
      const li = el("li", `${monsterName(e.loi)} · ${when}`);
      const moTa = loiSai[e.loi]?.moTa;
      if (moTa) li.append(el("small", moTa));
      return li;
    }),
  );
  if (state.notebook.length === 0) notebookEl.replaceChildren(el("li", "Chưa có lỗi nào."));
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function renderMission(): void {
  const m = state.mission;
  missionForm.hidden = !!m && m.dung < m.soCau;
  mailBadge.textContent = m && m.dung < m.soCau ? ` ${m.dung}/${m.soCau}` : "";
  if (!m) {
    missionEl.replaceChildren(el("p", "Chưa có nhiệm vụ."));
    return;
  }
  const han = m.han ? ` trước ngày ${formatDate(m.han)}` : "";
  const progress = m.dung >= m.soCau ? "Đã xong nhiệm vụ! Gửi mã kết quả bên dưới cho thầy cô nhé." : `Tiến độ: ${m.dung}/${m.soCau}`;
  missionEl.replaceChildren(
    el("p", `"Đào đúng ${m.soCau} câu ở chương ${m.chuong.join(", ")} lớp ${m.lop}${han}."`),
    el("p", progress),
    ...resultPanel(),
  );
}

/**
 * Mã kết quả luôn tính từ tiến độ hiện tại, nên em gửi lúc nào cũng là mới nhất.
 * Chỉ cần số thứ tự trong lớp (không cần tên); số này chỉ lưu trên máy em.
 */
function resultPanel(): HTMLElement[] {
  const m = state.mission;
  if (!m || Object.keys(m.bai).length === 0) return [];
  const stt = Number(loadStt());
  if (!Number.isInteger(stt) || stt < 1 || stt > 63) {
    const input = Object.assign(document.createElement("input"), { type: "number", min: "1", max: "63", required: true });
    const label = el("label", "Số thứ tự của em trong lớp (xem sổ điểm)");
    label.append(input);
    const form = el("form", "", { className: "result-form" });
    form.append(label, el("button", "Tạo mã kết quả"));
    form.onsubmit = (e) => {
      e.preventDefault();
      writeStt(input.value);
      render();
    };
    return [form];
  }
  const code = encodeResult(resultOf(state, stt)!);
  const text = `Em số ${stt} gửi kết quả nhiệm vụ: ${code}`;
  const copy = el("button", "Chép mã", { type: "button" });
  copy.onclick = () => {
    navigator.clipboard.writeText(text).then(
      () => (copy.textContent = "Đã chép, dán vào Zalo lớp"),
      () => getSelection()?.selectAllChildren(codeEl),
    );
  };
  const codeEl = el("p", code, { className: "result-code" });
  const buttons = el("p");
  buttons.append(copy);
  if ("share" in navigator) {
    buttons.append(" ", el("button", "Gửi…", { type: "button", onclick: () => void navigator.share({ text }).catch(() => undefined) }));
  }
  buttons.append(" ", el("button", `Đổi số thứ tự (${stt})`, { type: "button", className: "quiet", onclick: () => (writeStt(""), render()) }));
  return [el("p", "Mã kết quả gửi thầy cô:"), codeEl, buttons];
}

function takeMission(code: string): string | null {
  const r = decodeMission(code);
  if (!r.ok) return r.error;
  // Mã chuẩn hóa (chữ hoa, có gạch nối) để gõ tay hay mở link đều ra cùng một nhiệm vụ.
  update(acceptMission(state, r.mission, encodeMission(r.mission)));
  $<HTMLDialogElement>("sheet-mail").close();
  say(`Nhận thư Thợ Cả: đào đúng ${r.mission.soCau} câu. Chạm khối cạnh @ để đào quặng ◆.`);
  return null;
}

function update(next: GameState): void {
  state = next;
  writeSave(state);
  render();
  if (state.pending && !sheet.open) openQuestion();
}

// ---- Tấm câu hỏi ----

function openQuestion(): void {
  const q = currentQuestion(state, bank);
  if (!q) return;
  const pending = state.pending;
  qTitle.textContent =
    pending?.kind === "quai" ? `${monsterName(pending.loi)} chặn đường!` : `◆ Quặng${q.bai ? ` · ${q.bai}` : ""}`;
  renderMathText(qText, q.de);
  if (pending?.kind === "khoi" && q.goiY) renderMathText(qFeedback, `Gợi ý: ${q.goiY}`);
  else qFeedback.textContent = "";
  qForm.hidden = false;
  reviewEl.hidden = true;
  qChoices.replaceChildren();
  qInput.value = "";
  renderPreview();
  const choice = q.loai === "trac-nghiem";
  qAnswer.hidden = choice;
  keypadEl.hidden = choice;
  qSubmit.hidden = choice;
  qSubmit.textContent = pending?.kind === "quai" ? "Thu phục" : "Đào";
  if (choice) {
    q.luaChon.forEach((c, i) => {
      const btn = el("button", "", { type: "button", onclick: () => submit(choiceLetter(i)) });
      const body = el("span");
      renderMathText(body, c);
      btn.append(el("b", `${choiceLetter(i)}. `), body);
      qChoices.append(btn);
    });
  }
  sheet.returnValue = "";
  sheet.showModal();
  if (!choice) qInput.focus();
}

function renderPreview(): void {
  const tex = answerTex(qInput.value);
  if (tex) {
    katex.render(tex, qPreview, { throwOnError: false, trust: false });
  } else {
    qPreview.textContent = qInput.value.trim() ? "?" : "";
  }
}

/** Phím ảo chèn vào chỗ con trỏ, như gõ bàn phím thật. */
function press(value: string): void {
  const start = qInput.selectionStart ?? qInput.value.length;
  const end = qInput.selectionEnd ?? start;
  if (value === "back") {
    if (start === end && start > 0) qInput.setRangeText("", start - 1, start, "end");
    else qInput.setRangeText("", start, end, "end");
  } else {
    qInput.setRangeText(value, start, end, "end");
  }
  renderPreview();
}

keypadEl.replaceChildren(
  ...PAD_KEYS.map(([label, value]) =>
    el("button", label, {
      type: "button",
      ariaLabel: value === "back" ? "Xóa" : value === " " ? "Dấu cách (hỗn số)" : value === "-" ? "Dấu trừ" : label,
      onclick: () => press(value),
    }),
  ),
);
// Bấm phím ảo không lấy mất con trỏ khỏi ô đáp án.
keypadEl.addEventListener("pointerdown", (e) => e.preventDefault());
qInput.addEventListener("input", renderPreview);

function submit(input: string): void {
  const q = currentQuestion(state, bank);
  const atNight = state.pending?.kind === "quai";
  const r = answer(state, input, bank);
  if (!r || !q) return;
  if (!r.result.ok && r.result.reason === "khong-doc-duoc") {
    qFeedback.textContent = "Chưa đọc được đáp án. Gõ số, ví dụ 3, -0,5, 2/3 hoặc 1 1/2.";
    return;
  }
  const name = monsterName(monsterOf(q));
  update(r.state);
  if (r.result.ok) {
    sheet.close();
    say(atNight ? `Thu phục ${name}! +1 Đá Sáng.` : "Đúng! +1 quặng.");
    return;
  }
  // Sai thì nhẹ nhàng: lời giải mở ngay trong tấm, em đọc xong mới quay lại mỏ.
  const solution = q.loiGiai ? ` ${q.loiGiai}` : "";
  const tex = answerTex(r.result.expected);
  const expected = tex ? `$${tex.replace("\\dfrac", "\\frac")}$` : r.result.expected;
  const text = atNight
    ? `${name} chạy thoát, đêm sau sẽ quay lại. Đáp án là ${expected}.${solution}`
    : `Khối nứt nhưng chưa vỡ. Đáp án là ${expected}.${solution}`;
  renderMathText($("review-text"), text);
  qForm.hidden = true;
  reviewEl.hidden = false;
  $("review-next").textContent = atNight ? "Tiếp tục" : "Tiếp tục đào";
  $("review-next").focus();
  say(atNight ? `${name} chạy thoát.` : `Sổ Tay ghi: ${name}. Đêm nay nó sẽ hiện ra.`);
}

$("review-next").addEventListener("click", () => sheet.close());
// Đóng tấm khi câu còn chờ (Để sau, phím Esc) thì bỏ câu đó: không tốn mặt trời, không ghi lỗi.
sheet.addEventListener("close", () => {
  if (state.pending) update(cancelPending(state));
});
qForm.addEventListener("submit", (e) => {
  if ((e.submitter as HTMLButtonElement | null)?.value === "cancel") return;
  e.preventDefault();
  submit(qInput.value);
});

// ---- Các tấm Sổ Tay, Chế tạo, Thư, Cách chơi ----

$("tabs").addEventListener("click", (e) => {
  const id = (e.target as HTMLElement).closest("button")?.dataset.sheet;
  if (id) $<HTMLDialogElement>(id).showModal();
});
for (const d of document.querySelectorAll<HTMLDialogElement>("dialog.sheet:not(#question)")) {
  // Chạm ra ngoài tấm (vào nền mờ) thì đóng.
  d.addEventListener("click", (e) => {
    if (e.target === d) d.close();
  });
}
for (const d of document.querySelectorAll<HTMLDialogElement>("dialog.sheet")) {
  // Đóng tấm thì bỏ con trỏ khỏi nút vừa bấm, để phím cách lại là đào.
  d.addEventListener("close", () => (document.activeElement as HTMLElement | null)?.blur());
}
missionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = missionForm.elements.namedItem("code") as HTMLInputElement;
  const error = takeMission(input.value);
  $("mission-error").textContent = error ?? "";
  if (!error) input.value = "";
});

// ---- Đi và đào ----

function dirTo(dx: number, dy: number): Dir | null {
  return (Object.keys(DIRS) as Dir[]).find((d) => DIRS[d][0] === dx && DIRS[d][1] === dy) ?? null;
}

/** Chạm một ô: ô trống thì đi tới, khối thì @ tự đi đến cạnh khối rồi đào. */
function tap(x: number, y: number): void {
  if (state.phase !== "ngay" || state.pending) return;
  const block = blockAt(state.world, x, y);
  if (!block) return;
  const walked = walkTo(state, x, y);
  const { player } = walked;
  if (block === "khong") {
    if (walked === state && (player.x !== x || player.y !== y)) say("Chưa có đường hầm tới chỗ đó.");
    update(walked);
    return;
  }
  const dir = dirTo(x - player.x, y - player.y);
  if (!dir) {
    say("Khối đó chưa nằm cạnh đường hầm. Đào dần từ chỗ @ đứng.");
    return;
  }
  facing = dir;
  dig(walked, x, y);
}

function dig(from: GameState, x: number, y: number): void {
  const block = blockAt(from.world, x, y);
  if (block === "quang" && bank.length === 0) {
    say("Câu hỏi chưa nạp xong, đợi một chút rồi đào lại.");
    return;
  }
  const next = mine(from, x, y, bank);
  if (block && block !== "khong" && block !== "quang" && next !== from) say(`+1 ${ITEM_NAME[block]}`);
  update(next);
}

/** Phím mũi tên: đi một bước, gặp khối thì đào luôn. */
function step(d: Dir): void {
  if (state.phase !== "ngay" || state.pending) return;
  facing = d;
  const [dx, dy] = DIRS[d];
  const x = state.player.x + dx;
  const y = state.player.y + dy;
  if (blockAt(state.world, x, y) === "khong") update(move(state, dx, dy));
  else dig(state, x, y);
}

worldEl.addEventListener("click", (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>(".c");
  if (c) tap(Number(c.dataset.x), Number(c.dataset.y));
});

const KEYS: Record<string, Dir> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
};
window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (document.querySelector("dialog[open]") || target.closest("input, select, textarea")) return;
  // Phím cách trên một nút là bấm nút đó, không phải đào.
  if (e.key === " " && target.closest("button")) return;
  const dir = KEYS[e.key];
  if (dir) {
    e.preventDefault();
    if (state.phase === "ngay" && !state.pending) {
      facing = dir;
      const [dx, dy] = DIRS[dir];
      update(move(state, dx, dy));
    }
  } else if (e.key === " ") {
    e.preventDefault();
    const [dx, dy] = DIRS[facing];
    dig(state, state.player.x + dx, state.player.y + dy);
  }
});
window.addEventListener("resize", () => renderWorld());

render();
say("Chạm một khối cạnh @ để đào. Quặng ◆ thì phải giải toán.");
// Mở game từ link hoặc QR thầy cô gửi (#nv=...): nhận nhiệm vụ rồi xóa đuôi link để tải lại không nhận lần nữa.
const linkCode = missionFromHash(location.hash);
if (linkCode) {
  const error = takeMission(linkCode);
  if (error) say(`Mã nhiệm vụ trong link chưa đúng: ${error}`);
  history.replaceState(null, "", location.pathname + location.search);
}

loadBank(7)
  .then((c) => {
    bank = c.bank;
    loiSai = c.loiSai;
    render();
  })
  .catch((err: Error) => {
    say(`Không nạp được câu hỏi: ${err.message}`);
  });

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}
