/**
 * Kiểm định nội dung và (tuỳ chọn) xuất bản phát hành JSON.
 *
 *   tsx content/scripts/validate.ts                 # chỉ kiểm định
 *   tsx content/scripts/validate.ts --out <thư mục> # kiểm định rồi xuất JSON + index.json
 *
 * Biến môi trường CONTENT_VERSION đặt mã phiên bản (mặc định "dev"); khi phát hành thật
 * dùng tag ngày, ví dụ 2026.10.22.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "./load";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outIdx = process.argv.indexOf("--out");
const out = outIdx > 0 ? resolve(process.argv[outIdx + 1] ?? "") : null;

const { chuong, errors } = loadContent(root);
if (errors.length > 0) {
  console.error(`Có ${errors.length} lỗi trong nội dung:\n`);
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
const total = chuong.reduce((n, c) => n + c.data.cauHoi.length, 0);
console.log(`Nội dung hợp lệ: ${chuong.length} chương, ${total} câu hỏi.`);

if (out) {
  rmSync(out, { recursive: true, force: true });
  const index = {
    schemaVersion: 1,
    version: process.env.CONTENT_VERSION ?? "dev",
    chuong: chuong.map(({ data }) => {
      const path = `lop-${data.lop}/chuong-${data.chuong}.json`;
      mkdirSync(join(out, `lop-${data.lop}`), { recursive: true });
      writeFileSync(join(out, path), JSON.stringify(data));
      return { lop: data.lop, chuong: data.chuong, ten: data.ten, soCau: data.cauHoi.length, path };
    }),
  };
  writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 2));
  console.log(`Đã xuất vào ${out}`);
}
