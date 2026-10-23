/** Mẫu bảng câu hỏi cho giáo viên: .xlsx (khuyên dùng với Excel) và CSV UTF-8 (Google Trang tính, LibreOffice). */
import { COLUMNS } from "./bang";
import { writeXlsx } from "./xlsx";

export interface TemplateOptions {
  lop: number;
  chuong: number;
  ten?: string;
  loiSai?: Record<string, { ten: string; moTa: string }>;
}

function exampleRows(o: TemplateOptions): string[][] {
  const loi = Object.keys(o.loiSai ?? {})[0] ?? "";
  const row = (v: Partial<Record<(typeof COLUMNS)[number]["key"], string>>) => COLUMNS.map((c) => v[c.key] ?? "");
  return [
    row({
      id: "VD1",
      bai: "Cộng, trừ, nhân, chia số hữu tỉ",
      loai: "số",
      de: "Tính $\\frac{1}{2} + \\frac{1}{3}$.",
      dapAn: "5/6",
      goiY: "Quy đồng mẫu số chung là 6.",
      loiGiai: "$\\frac{1}{2} + \\frac{1}{3} = \\frac{3}{6} + \\frac{2}{6} = \\frac{5}{6}$.",
      doKho: "1",
      loiSai: loi,
    }),
    row({
      id: "VD2",
      loai: "trắc nghiệm",
      de: "Số nào là số đối của $-\\frac{2}{3}$?",
      dapAn: "B",
      A: "$-\\frac{3}{2}$",
      B: "$\\frac{2}{3}$",
      C: "$\\frac{3}{2}$",
      D: "$-\\frac{2}{3}$",
      doKho: "1",
    }),
    row({ id: "VD3", de: "Viết $\\frac{1}{4}$ dưới dạng số thập phân.", dapAn: "0,25", doKho: "1" }),
  ];
}

function guide(o: TemplateOptions): string[][] {
  const lines = [
    `Mẫu câu hỏi Thế Giới Khối Toán, lớp ${o.lop} chương ${o.chuong}${o.ten ? `: ${o.ten}` : ""}.`,
    "",
    "Cách dùng",
    "1. Soạn mỗi câu một dòng ở trang Câu hỏi, giữ nguyên dòng tiêu đề.",
    "2. Các dòng có Mã câu bắt đầu bằng VD là ví dụ, được bỏ qua. Có thể xoá đi.",
    "3. Mở trang Nhập câu hỏi của game, chọn file này để kiểm tra. Trang chỉ đọc file trên máy, không gửi đi đâu.",
    "",
    "Lưu ý",
    "• Mọi ô đã để sẵn dạng Văn bản, nên gõ 1/2 không bị Excel đổi thành ngày. Khi dán từ nơi khác, dùng Dán giá trị (Ctrl+Shift+V).",
    "• Dấu thập phân dùng dấu phẩy hay dấu chấm đều được: 0,5 và 0.5 như nhau. Không dùng dấu ngăn cách hàng nghìn.",
    "• Học sinh gõ cách viết tương đương nào cũng được chấm đúng: 1/2, 2/4, 0,5.",
    "• Công thức đặt trong $...$ theo cú pháp LaTeX, ví dụ $\\frac{3}{4}$, $x^2$, $\\sqrt{2}$. Số thập phân trong công thức viết $0{,}5$.",
    "",
    "Các cột",
    ...COLUMNS.filter((c) => c.help).map((c) => `• ${c.header}: ${c.help}`),
  ];
  return lines.map((l) => [l]);
}

export function templateXlsx(o: TemplateOptions): Uint8Array {
  const header = COLUMNS.map((c) => c.header);
  const loiSai = Object.entries(o.loiSai ?? {});
  const loaiCol = COLUMNS.findIndex((c) => c.key === "loai");
  const doKhoCol = COLUMNS.findIndex((c) => c.key === "doKho");
  const loiCol = COLUMNS.findIndex((c) => c.key === "loiSai");
  const lists: Record<number, string[]> = { [loaiCol]: ["số", "trắc nghiệm"], [doKhoCol]: ["1", "2", "3"] };
  // Danh sách chọn của Excel giới hạn 255 ký tự.
  if (loiSai.length > 0 && loiSai.map(([ma]) => ma).join(",").length < 250) lists[loiCol] = loiSai.map(([ma]) => ma);

  return writeXlsx([
    { name: "Câu hỏi", rows: [header, ...exampleRows(o)], widths: COLUMNS.map((c) => c.width), header: true, lists },
    { name: "Hướng dẫn", rows: guide(o), widths: [110] },
    ...(loiSai.length > 0
      ? [{ name: "Lỗi sai", rows: [["Mã", "Tên quái", "Lỗi sai"], ...loiSai.map(([ma, l]) => [ma, l.ten, l.moTa])], widths: [18, 22, 70], header: true }]
      : []),
  ]);
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV có BOM để Excel nhận ra UTF-8. Mở bằng Excel thì 5/6 vẫn có thể bị đổi thành ngày: nên dùng mẫu .xlsx. */
export function templateCsv(o: TemplateOptions): string {
  const rows = [COLUMNS.map((c) => c.header), ...exampleRows(o)];
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
