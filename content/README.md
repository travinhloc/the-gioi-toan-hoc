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

## Soạn bằng Excel

Giáo viên không cần biết YAML: trang [Nhập câu hỏi](https://travinhloc.github.io/the-gioi-toan-hoc/nhap-cau-hoi.html)
cho tải mẫu Excel (.xlsx) hoặc CSV, mỗi câu một dòng, rồi kiểm tra file ngay trên trình duyệt bằng
chính máy chấm của game và xuất ra YAML để dán vào đây. File không rời khỏi máy giáo viên.

Trang tự xử lý các lỗi hay gặp khi soạn bằng Excel:

- **Bảng mã**: đọc .xlsx, CSV UTF-8 (có hoặc không BOM), UTF-16 ("Văn bản Unicode") và Windows-1258
  (CSV mặc định của Excel tiếng Việt), chuẩn hoá về NFC; cảnh báo chữ gõ bằng TCVN3/VNI hoặc bị lỗi bảng mã.
- **Phân số bị đổi thành ngày**: mẫu .xlsx để sẵn mọi ô dạng Văn bản. Với CSV, `01/02/2026` hay `2-Jan`
  được đoán lại thành `1/2` kèm cảnh báo; ô ngày trong .xlsx thì báo lỗi vì không biết ngày/tháng hay tháng/ngày.
- **Dấu thập phân**: `0,5` và `0.5` như nhau; `1.000` được cảnh báo vì có thể là một nghìn; CSV dùng
  dấu chấm phẩy (Excel vùng Việt Nam) hay Tab (dán từ Excel) đều nhận.
- **Trùng**: mã trùng trong file hoặc trùng câu đã phát hành là lỗi; đề giống hệt là cảnh báo. Để trống
  cột Mã câu thì mã được đánh tiếp sau mã lớn nhất đã có.

Mã nguồn ở `packages/importer` (thuần TypeScript, không phụ thuộc DOM), dùng chung với script kiểm định.

## Kiểm định

```sh
npm run content:validate
```

Script kiểm tra schema, mã trùng, mã đúng lớp và chương, đáp án đọc được bằng chính máy chấm
của game, và mọi công thức KaTeX dựng được. CI chạy script này trên mọi PR.
