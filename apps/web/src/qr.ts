import qrcode from "qrcode-generator";

const SVG = "http://www.w3.org/2000/svg";
/** Viền trắng 4 ô theo chuẩn QR, thiếu viền thì nhiều máy quét không bắt được. */
const QUIET = 4;

/** Ma trận ô đen/trắng của mã QR. Mức sửa lỗi M: vẫn quét được khi ảnh chụp bảng hơi mờ. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Vẽ mã QR thành SVG co giãn theo khung chứa (dựng bằng DOM, không dùng innerHTML). */
export function qrSvg(text: string, label: string): SVGSVGElement {
  const m = qrMatrix(text);
  const size = m.length + QUIET * 2;
  let d = "";
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    }),
  );
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("shape-rendering", "crispEdges");
  const bg = document.createElementNS(SVG, "rect");
  bg.setAttribute("width", String(size));
  bg.setAttribute("height", String(size));
  bg.setAttribute("fill", "#fff");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "#000");
  svg.append(bg, path);
  return svg;
}

/**
 * Ảnh PNG để gửi vào nhóm Zalo: mã QR và mã chữ bên dưới (học sinh không quét được
 * thì gõ mã). Vẽ trên canvas nên không cần thư viện ảnh.
 */
export function qrPng(text: string, caption: string): Promise<Blob | null> {
  const m = qrMatrix(text);
  const cell = 10;
  const side = (m.length + QUIET * 2) * cell;
  const captionH = 64;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side + captionH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect((x + QUIET) * cell, (y + QUIET) * cell, cell, cell);
    }),
  );
  ctx.font = `700 ${Math.round(side / 14)}px "Noto Sans Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, side / 2, side + captionH / 2 - 8);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
