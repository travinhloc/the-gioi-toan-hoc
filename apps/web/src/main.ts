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
  fight,
  isNight,
  mine,
  missionFromHash,
  monsterOf,
  monsters,
  move,
  newGame,
  RECIPES,
  sleep,
  startDay,
  SUN_MAX,
  type Block,
  type GameState,
  type Item,
} from "@tgth/engine";
import { choiceLetter } from "@tgth/grader";
import { loadBank, type ContentQuestion, type LoiSai } from "./content";
import { renderMathText } from "./math";
import { loadSave, writeSave } from "./save";
import "@fontsource/noto-sans-mono/latin-400.css";
import "@fontsource/noto-sans-mono/latin-700.css";
import "@fontsource/noto-sans-mono/vietnamese-400.css";
import "@fontsource/noto-sans-mono/vietnamese-700.css";
import "./style.css";

const GLYPH: Record<Block, string> = { khong: " ", dat: "▒", da: "█", go: "♣", quang: "◆" };
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
type Dir = keyof typeof DIRS;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const worldEl = $<HTMLPreElement>("world");
const statusEl = $("status");
const inventoryEl = $<HTMLUListElement>("inventory");
const recipesEl = $("recipes");
const phaseEl = $("phase");
const notebookEl = $<HTMLUListElement>("notebook");
const missionEl = $("mission");
const missionForm = $<HTMLFormElement>("mission-form");
const dialog = $<HTMLDialogElement>("question");
const qText = $("question-text");
const qChoices = $("question-choices");
const qInput = $<HTMLInputElement>("question-input");
const qInputLabel = $("question-input-label");
const qFeedback = $("question-feedback");
const qSubmit = $<HTMLButtonElement>("question-submit");

let state: GameState = loadSave() ?? newGame(Date.now() % 100000);
let bank: ContentQuestion[] = [];
let loiSai: Record<string, LoiSai> = {};
let facing: Dir = "right";

function render(): void {
  const { world, player } = state;
  const rows: string[] = [];
  for (let y = 0; y < world.height; y++) {
    let row = "";
    for (let x = 0; x < world.width; x++) {
      row += x === player.x && y === player.y ? "@" : GLYPH[blockAt(world, x, y) ?? "khong"];
    }
    rows.push(row);
  }
  worldEl.textContent = rows.join("\n");
  document.body.classList.toggle("night", isNight(state));
  statusEl.textContent = statusLine();
  renderPhase();
  renderNotebook();
  renderMission();

  inventoryEl.replaceChildren(
    ...Object.entries(state.inventory)
      .filter(([, n]) => n && n > 0)
      .map(([item, n]) => Object.assign(document.createElement("li"), { textContent: `${ITEM_NAME[item as Item]}: ${n}` })),
  );
  recipesEl.replaceChildren(
    ...RECIPES.map((r) =>
      Object.assign(document.createElement("button"), {
        textContent: r.ten,
        disabled: !canCraft(state.inventory, r),
        onclick: () => update(craftRecipe(state, r.id)),
      }),
    ),
  );
}

function statusLine(): string {
  if (state.phase === "ngay") return `Ngày ${state.day} · ☼ ${"▮".repeat(state.sun)}${"▯".repeat(SUN_MAX - state.sun)}`;
  if (state.phase === "dem") return `Đêm ${state.day} · ${monsters(state).length} quái lỗi sai`;
  return `Sáng ngày ${state.day + 1}`;
}

/** Tên quái của một mã lỗi; câu chưa gắn lỗi sai thì gọi chung. */
function monsterName(loi: string): string {
  return loiSai[loi]?.ten ?? "Quái lỗi sai";
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", props: Partial<HTMLElementTagNameMap[K]> = {}) {
  return Object.assign(document.createElement(tag), { textContent: text }, props);
}

function renderPhase(): void {
  if (state.phase === "ngay") {
    phaseEl.replaceChildren(el("p", "Đào quặng ◆ để giải toán. Mỗi câu tốn một nấc mặt trời, câu sai tốn thêm một nấc."));
  } else if (state.phase === "dem") {
    phaseEl.replaceChildren(
      el("p", "Đêm xuống, các lỗi trong Sổ Tay hóa thành quái. Trả lời đúng để thu phục chúng."),
      ...monsters(state).map((m) =>
        el("button", `Đấu ${monsterName(m.loi)}`, { onclick: () => update(fight(state, m.loi, bank)) }),
      ),
      el("button", "Đi ngủ (quái quay lại đêm sau)", { className: "quiet", onclick: () => update(sleep(state)) }),
    );
  } else {
    const t = state.today;
    phaseEl.replaceChildren(
      el("p", `Hôm qua: đào đúng ${t.dung} câu, sai ${t.sai} câu.`),
      el("p", `Đêm qua: thu phục ${t.thuPhuc} quái, ${t.chayThoat} quái chạy thoát.`),
      el("p", `Sổ Tay còn ${state.notebook.length} lỗi đang theo dõi.`),
      el("button", "Bắt đầu ngày mới", { onclick: () => update(startDay(state)) }),
    );
  }
}

function renderNotebook(): void {
  notebookEl.replaceChildren(
    ...state.notebook.map((e) => {
      const wait = e.due - state.day;
      const when = wait <= 0 ? "đêm nay" : `sau ${wait} ngày`;
      return el("li", `${monsterName(e.loi)} · ${when}`, { title: loiSai[e.loi]?.moTa ?? "" });
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
  if (!m) {
    missionEl.replaceChildren(el("p", "Chưa có nhiệm vụ. Thầy cô gửi link hoặc mã thì nhập vào đây."));
    return;
  }
  const han = m.han ? ` trước ngày ${formatDate(m.han)}` : "";
  const progress = m.dung >= m.soCau ? "Đã xong nhiệm vụ!" : `Tiến độ: ${m.dung}/${m.soCau}`;
  missionEl.replaceChildren(
    el("p", `"Đào đúng ${m.soCau} câu ở chương ${m.chuong.join(", ")} lớp ${m.lop}${han}."`),
    el("p", progress),
  );
}

function takeMission(code: string): string | null {
  const r = decodeMission(code);
  if (!r.ok) return r.error;
  // Mã chuẩn hóa (chữ hoa, có gạch nối) để gõ tay hay mở link đều ra cùng một nhiệm vụ.
  update(acceptMission(state, r.mission, encodeMission(r.mission)));
  // Đưa con trỏ về bản đồ, nếu không phím mũi tên vẫn bị ô nhập mã giữ lại.
  worldEl.focus();
  statusEl.textContent = `${statusLine()} · Đã nhận nhiệm vụ! Mũi tên để đi, phím cách để đào quặng ◆.`;
  return null;
}

function update(next: GameState): void {
  state = next;
  writeSave(state);
  render();
  if (state.pending && !dialog.open) openQuestion();
}

function openQuestion(): void {
  const q = currentQuestion(state, bank);
  if (!q) return;
  renderMathText(qText, q.de);
  const pending = state.pending;
  if (pending?.kind === "quai") qFeedback.textContent = `${monsterName(pending.loi)} chặn đường!`;
  else renderMathText(qFeedback, q.goiY ? `Gợi ý: ${q.goiY}` : "");
  qChoices.replaceChildren();
  qInput.value = "";
  if (q.loai === "trac-nghiem") {
    qInputLabel.hidden = true;
    qSubmit.hidden = true;
    q.luaChon.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const letter = document.createElement("b");
      letter.textContent = `${choiceLetter(i)}. `;
      const body = document.createElement("span");
      renderMathText(body, c);
      btn.append(letter, body);
      btn.onclick = () => submit(choiceLetter(i));
      qChoices.append(btn);
    });
  } else {
    qInputLabel.hidden = false;
    qSubmit.hidden = false;
  }
  dialog.showModal();
  if (q.loai === "so") qInput.focus();
}

function submit(input: string): void {
  const q = currentQuestion(state, bank);
  const atNight = state.pending?.kind === "quai";
  const r = answer(state, input, bank);
  if (!r || !q) return;
  if (!r.result.ok && r.result.reason === "khong-doc-duoc") {
    qFeedback.textContent = "Chưa đọc được đáp án. Gõ số, ví dụ 3, -0,5 hoặc 2/3.";
    return;
  }
  dialog.close();
  update(r.state);
  const name = monsterName(monsterOf(q));
  let message: string;
  if (r.result.ok) {
    message = atNight ? `Thu phục ${name}! +1 Đá Sáng.` : "Đúng! +1 quặng.";
  } else {
    const solution = q.loiGiai ? ` ${q.loiGiai}` : "";
    message = atNight
      ? `${name} chạy thoát, đêm sau sẽ quay lại. Đáp án là ${r.result.expected}.`
      : `Chưa đúng, đáp án là ${r.result.expected}.${solution} Sổ Tay ghi: ${name}, đêm nay nó sẽ hiện ra.`;
  }
  renderMathText(statusEl, message);
}

dialog.addEventListener("close", () => {
  if (dialog.returnValue === "cancel" && state.pending) update(cancelPending(state));
});
missionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = missionForm.elements.namedItem("code") as HTMLInputElement;
  const error = takeMission(input.value);
  $("mission-error").textContent = error ?? "";
  if (!error) input.value = "";
});
dialog.querySelector("form")!.addEventListener("submit", (e) => {
  if ((e.submitter as HTMLButtonElement | null)?.value === "cancel") return;
  e.preventDefault();
  submit(qInput.value);
});

function step(dir: Dir): void {
  facing = dir;
  const [dx, dy] = DIRS[dir];
  update(move(state, dx, dy));
}

function dig(): void {
  const [dx, dy] = DIRS[facing];
  update(mine(state, state.player.x + dx, state.player.y + dy, bank));
}

const KEYS: Record<string, Dir> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
};
window.addEventListener("keydown", (e) => {
  if (dialog.open || (e.target as HTMLElement).closest("input, select, textarea")) return;
  const dir = KEYS[e.key];
  if (dir) {
    e.preventDefault();
    step(dir);
  } else if (e.key === " ") {
    e.preventDefault();
    dig();
  }
});
$("pad").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  if (btn.dataset.act === "mine") dig();
  else if (btn.dataset.dir) step(btn.dataset.dir as Dir);
});

render();
// Mở game từ link thầy cô gửi (#nv=...): nhận nhiệm vụ rồi xóa đuôi link để tải lại không nhận lần nữa.
const linkCode = missionFromHash(location.hash);
if (linkCode) {
  const error = takeMission(linkCode);
  if (error) $("mission-error").textContent = error;
  history.replaceState(null, "", location.pathname + location.search);
}

loadBank(7)
  .then((c) => {
    bank = c.bank;
    loiSai = c.loiSai;
    render();
    statusEl.textContent = `${statusLine()} · đã nạp ${bank.length} câu hỏi lớp 7 (nội dung ${c.version}).`;
  })
  .catch((err: Error) => {
    statusEl.textContent = `Không nạp được câu hỏi: ${err.message}`;
  });

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}
