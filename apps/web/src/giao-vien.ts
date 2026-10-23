import { encodeMission } from "@tgth/engine";
import { loadIndex, type ContentIndex } from "./content";
import { qrPng, qrSvg } from "./qr";
import "@fontsource/noto-sans-mono/latin-400.css";
import "@fontsource/noto-sans-mono/latin-700.css";
import "@fontsource/noto-sans-mono/vietnamese-400.css";
import "@fontsource/noto-sans-mono/vietnamese-700.css";
import "./style.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("mission-builder");
const chaptersEl = $("chapters");
const errorEl = $("builder-error");
const resultEl = $("result");
const codeEl = $("code");
const linkEl = $<HTMLInputElement>("link");
const qrEl = $("qr");
const projector = $<HTMLDialogElement>("projector");

let index: ContentIndex | null = null;

function field(name: string): HTMLInputElement | HTMLSelectElement {
  return form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
}

/** Liệt kê các chương đã có nội dung của lớp đang chọn. */
function renderChapters(): void {
  const lop = Number(field("lop").value);
  const list = (index?.chuong ?? []).filter((c) => c.lop === lop);
  if (list.length === 0) {
    chaptersEl.textContent = index ? "Lớp này chưa có nội dung." : "Đang tải danh sách chương...";
    return;
  }
  chaptersEl.replaceChildren(
    ...list.map((c) => {
      const label = document.createElement("label");
      label.className = "check";
      const box = Object.assign(document.createElement("input"), { type: "checkbox", name: "chuong", value: String(c.chuong) });
      label.append(box, ` Chương ${c.chuong}: ${c.ten} (${c.soCau} câu)`);
      return label;
    }),
  );
}

async function copy(text: string, button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Đã chép";
  } catch {
    // Trình duyệt chặn clipboard: chọn sẵn để thầy cô tự chép.
    linkEl.select();
  }
}

form.addEventListener("change", (e) => {
  if ((e.target as HTMLElement).getAttribute("name") === "lop") renderChapters();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const chuong = [...form.querySelectorAll<HTMLInputElement>('input[name="chuong"]:checked')].map((b) => Number(b.value));
  const id = crypto.getRandomValues(new Uint32Array(1))[0]! & 0xffffff;
  try {
    const code = encodeMission({
      lop: Number(field("lop").value),
      chuong,
      soCau: Number(field("soCau").value),
      han: field("han").value || null,
      id,
    });
    errorEl.textContent = "";
    codeEl.textContent = code;
    linkEl.value = new URL(`./#nv=${code}`, document.baseURI).href;
    // QR chứa cả link (không chỉ mã) để camera điện thoại mở thẳng game với nhiệm vụ.
    qrEl.replaceChildren(qrSvg(linkEl.value, `Mã QR mở nhiệm vụ ${code}`));
    resultEl.hidden = false;
    $<HTMLButtonElement>("project").addEventListener("click", () => {
  const code = codeEl.textContent ?? "";
  $("projector-qr").replaceChildren(qrSvg(linkEl.value, `Mã QR mở nhiệm vụ ${code}`));
  $("projector-code").textContent = code;
  projector.showModal();
});

$<HTMLButtonElement>("save-qr").addEventListener("click", async () => {
  const code = codeEl.textContent ?? "";
  const png = await qrPng(linkEl.value, code);
  if (!png) return;
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(png),
    download: `nhiem-vu-${code}.png`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$<HTMLButtonElement>("copy-link").textContent = "Chép link";
    $<HTMLButtonElement>("copy-code").textContent = "Chép mã";
  } catch (err) {
    errorEl.textContent = (err as Error).message;
    resultEl.hidden = true;
  }
});

$<HTMLButtonElement>("copy-link").addEventListener("click", (e) => void copy(linkEl.value, e.currentTarget as HTMLButtonElement));
$<HTMLButtonElement>("copy-code").addEventListener("click", (e) => void copy(codeEl.textContent ?? "", e.currentTarget as HTMLButtonElement));

renderChapters();
loadIndex()
  .then((i) => {
    index = i;
    renderChapters();
  })
  .catch((err: Error) => {
    chaptersEl.textContent = `Không tải được danh sách chương: ${err.message}`;
  });
