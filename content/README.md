# Nội dung câu hỏi

Mỗi file YAML là một chương (một vùng mỏ trong game), theo SGK Toán Kết nối tri thức.
Nội dung được cấp phép [CC BY-SA 4.0](LICENSE). Cấu trúc file được mô tả ở [`schema/chuong.schema.json`](schema/chuong.schema.json).

Thư mục này tạm nằm trong repo game. Khi có người đóng góp nội dung thường xuyên, nó sẽ
được tách sang repo riêng (có CODEOWNERS cho giáo viên duyệt, phát hành JSON lên GitHub Pages
kèm tag theo ngày), và game chỉ đọc bản phát hành đó.

## Quy ước

- `id` có dạng `l<lớp>-c<chương>-<4 chữ số>`, ví dụ `l7-c1-0002`. Mã đã phát hành thì
  **không đổi và không dùng lại**, kể cả khi xoá câu hỏi, vì tiến độ học sinh gắn với mã.
- `loai: so` nhận đáp án là số nguyên, số thập phân (dấu phẩy hoặc chấm), phân số hoặc hỗn số.
  Học sinh gõ cách viết tương đương nào cũng được chấm đúng (`1/2`, `2/4`, `0,5`).
- `loai: trac-nghiem` cần `luaChon` (2 đến 6 phương án), `dapAn` là chữ cái `A`, `B`, ...
- Công thức đặt trong `$...$`, dựng bằng KaTeX ở chế độ an toàn. Trong YAML, viết `\\frac`.

## Kiểm định

```sh
npm run content:validate
```

Script kiểm tra schema, mã trùng, mã đúng lớp và chương, đáp án đọc được bằng chính máy chấm
của game, và mọi công thức KaTeX dựng được. CI chạy script này trên mọi PR.
