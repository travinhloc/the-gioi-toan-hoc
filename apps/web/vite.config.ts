import { defineConfig } from "vite";

// base tương đối để chạy được cả ở gốc tên miền lẫn ở GitHub Pages (/the-gioi-toan-hoc/).
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
});
