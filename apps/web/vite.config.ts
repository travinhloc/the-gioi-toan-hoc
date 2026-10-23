import { defineConfig } from "vite";

// base tương đối để chạy được cả ở gốc tên miền lẫn ở GitHub Pages (/the-gioi-toan-hoc/).
// Các trang: game (index.html), trang giáo viên tạo mã nhiệm vụ (giao-vien.html)
// và trang soạn câu hỏi bằng Excel (nhap-cau-hoi.html).
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    rollupOptions: { input: { main: "index.html", "giao-vien": "giao-vien.html", "nhap-cau-hoi": "nhap-cau-hoi.html" } },
  },
});
