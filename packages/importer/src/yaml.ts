/** Xuất câu hỏi thành YAML theo đúng quy ước thư mục content/. */
import { stringify } from "yaml";
import type { CauHoiNhap } from "./bang";

export interface ChapterInfo {
  lop: number;
  chuong: number;
  ten: string;
  nguon?: string;
}

function item(q: CauHoiNhap): string {
  return stringify([q], { lineWidth: 0 })
    .trimEnd()
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}

/** Đoạn để dán vào cuối danh sách `cauHoi:` của một chương đã có. */
export function questionsYaml(cauHoi: CauHoiNhap[]): string {
  return cauHoi.map(item).join("\n\n") + "\n";
}

/** Cả một file chương mới. */
export function chapterYaml(info: ChapterInfo, cauHoi: CauHoiNhap[]): string {
  const head = stringify({ schemaVersion: 1, lop: info.lop, chuong: info.chuong, ten: info.ten, ...(info.nguon ? { nguon: info.nguon } : {}) }, { lineWidth: 0 });
  return `# Soạn bằng mẫu Excel, cần giáo viên rà lại trước khi dùng thật.\n${head}cauHoi:\n${questionsYaml(cauHoi)}`;
}
