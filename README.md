# Thế Giới Khối Toán

Game ôn Toán THCS (lớp 6 đến 9, theo SGK Kết nối tri thức), miễn phí, phi lợi nhuận và mã nguồn mở.
Người chơi đào khối, chế tạo đồ và xây dựng; muốn đào quặng thì phải giải một câu toán. Mỗi câu
tốn một nấc mặt trời, câu sai tốn thêm một nấc và được ghi vào Sổ Tay. Hết mặt trời thì đêm xuống,
lỗi sai hóa thành quái để ôn lại; thu phục rồi thì quái quay lại sau 1, 3, 7, 14 ngày. Không có tim,
không có màn thua.

Thầy cô tạo mã nhiệm vụ ở `giao-vien.html` (link hoặc 15 kí tự gõ tay), gửi cho lớp qua Zalo. Mã chỉ
chứa lớp, chương, số câu và hạn; không cần tài khoản hay máy chủ.

Làm nhiệm vụ xong, học sinh gõ số thứ tự trong lớp để lấy mã kết quả (KQ-...) rồi gửi lại vào nhóm
Zalo. Thầy cô dán cả đoạn chat vào Bảng lỗi sai trên cùng trang giáo viên: mỗi lỗi sai là một hàng,
bao nhiêu em mắc, bao nhiêu em đã thu phục, số thứ tự các em cần hỗ trợ; xuất được CSV. Mã kết quả
không có tên học sinh, và không có gì rời máy ngoài đoạn mã các em tự tay gửi.

Chơi ngay: https://travinhloc.github.io/the-gioi-toan-hoc/ (trang giáo viên:
https://travinhloc.github.io/the-gioi-toan-hoc/giao-vien.html).

Bản đầu tiên (MVP) nhắm tới lớp 7, chương I đến IV, với hai hoạt động Đào và Chế tạo.

## Cấu trúc

```
packages/grader   Máy chấm: đọc số kiểu Việt Nam (0,5; 1/2; 1 1/2), so sánh chính xác bằng phân số.
                  TypeScript thuần, không dùng DOM, dùng chung cho game, CI nội dung và công cụ giáo viên.
packages/engine   Engine game: thế giới khối, đào, chế tạo, mặt trời và đêm, Sổ Tay lỗi sai, mã nhiệm vụ,
                  mã kết quả và Bảng lỗi sai.
                  Thuần, không DOM.
apps/web          Ứng dụng PWA (Vite): vẽ thế giới bằng chữ khối đơn cách, KaTeX cho công thức,
                  service worker để chơi offline.
content           Ngân hàng câu hỏi YAML, schema và script kiểm định (tạm đặt ở đây, sẽ tách repo).
```

Engine và máy chấm không được chạm vào DOM: tsconfig của chúng không nạp thư viện `DOM`, và ESLint
chặn `window`, `document`, `localStorage`, `navigator`.

Game chỉ đọc nội dung ở dạng bản phát hành JSON (`index.json` cộng mỗi chương một file), không đọc
YAML trực tiếp. Đặt `VITE_CONTENT_URL` để trỏ sang bản phát hành ở nơi khác.

## Chạy thử

Cần Node 20 trở lên.

```sh
npm install
npm run dev       # dựng nội dung rồi mở máy chủ phát triển
npm run check     # lint, typecheck, test, kiểm định nội dung
npm run build     # bản phát hành trong apps/web/dist
```

Mỗi lần `main` thay đổi, workflow `.github/workflows/pages.yml` build lại và đưa lên GitHub Pages.
Lần đầu cần bật Settings → Pages → Source: GitHub Actions.

## Dữ liệu và quyền riêng tư

Người chơi phần lớn dưới 13 tuổi. Game không có tài khoản, không thu thập dữ liệu; tiến độ chỉ lưu
trong trình duyệt trên máy đang chơi.

## Giấy phép

- Mã nguồn: [MIT](LICENSE).
- Nội dung câu hỏi trong `content/`: [CC BY-SA 4.0](content/LICENSE).

Dự án không dùng tài sản, tên hay logo của Minecraft hoặc bất kỳ trò chơi thương mại nào.
