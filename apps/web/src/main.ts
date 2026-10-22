import {
  answer,
  blockAt,
  canCraft,
  craftRecipe,
  currentQuestion,
  isNight,
  mine,
  move,
  newGame,
  RECIPES,
  type Block,
  type GameState,
  type Item,
} from "@tgth/engine";
import { choiceLetter } from "@tgth/grader";
import { loadBank, type ContentQuestion } from "./content";
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
  "cuoc-go": "Cuốc gỗ",
  "cuoc-da": "Cuốc đá",
  duoc: "Đuốc",
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
type Dir = keyof typeof DIRS;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const worldEl = $<HTMLPreElement>("world");
const statusEl = $("status");
const inventoryEl = $<HTMLUListElement>("inventory");
const recipesEl = $("recipes");
const dialog = $<HTMLDialogElement>("question");
const qText = $("question-text");
const qChoices = $("question-choices");
const qInput = $<HTMLInputElement>("question-input");
const qInputLabel = $("question-input-label");
const qFeedback = $("question-feedback");
const qSubmit = $<HTMLButtonElement>("question-submit");

let state: GameState = loadSave() ?? newGame(Date.now() % 100000);
let bank: ContentQuestion[] = [];
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

  const night = isNight(state) ? "Đêm" : "Ngày";
  const monsters = state.mistakes.length ? `, ${state.mistakes.length} quái lỗi sai đang chờ` : "";
  statusEl.textContent = `${night}${monsters}`;

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
  renderMathText(qFeedback, q.goiY ? `Gợi ý: ${q.goiY}` : "");
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
  const r = answer(state, input, bank);
  if (!r || !q) return;
  if (r.result.ok) {
    dialog.close();
    update(r.state);
    return;
  }
  if (r.result.reason === "khong-doc-duoc") {
    qFeedback.textContent = "Chưa đọc được đáp án. Gõ số, ví dụ 3, -0,5 hoặc 2/3.";
    return;
  }
  dialog.close();
  update(r.state);
  statusEl.textContent = `Chưa đúng. Đáp án là ${r.result.expected}. Câu này sẽ quay lại vào ban đêm.`;
}

dialog.addEventListener("close", () => {
  if (dialog.returnValue === "cancel" && state.pending) update({ ...state, pending: null });
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
  if (dialog.open) return;
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
loadBank(7)
  .then((c) => {
    bank = c.bank;
    statusEl.textContent = `Đã nạp ${bank.length} câu hỏi lớp 7 (nội dung ${c.version}).`;
  })
  .catch((err: Error) => {
    statusEl.textContent = `Không nạp được câu hỏi: ${err.message}`;
  });

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}
