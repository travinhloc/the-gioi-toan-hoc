import { defineConfig } from "vite";

// base tương đối để chạy được cả ở gốc tên miền lẫn ở GitHub Pages (/the-gioi-toan-hoc/).
// Hai trang: game (index.html) và trang giáo viên tạo mã nhiệm vụ (giao-vien.html).
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    rollupOptions: { input: { main: "index.html", "giao-vien": "giao-vien.html" } },
  },
});
