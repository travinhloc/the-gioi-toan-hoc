import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "apps/web/public/content/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.ts"],
    rules: {
      // Engine và máy chấm phải chạy được ở mọi nơi (trình duyệt, Node, worker),
      // nên cấm chạm vào DOM. tsconfig không nạp lib "DOM" cũng chặn ở bước typecheck.
      "no-restricted-globals": ["error", "window", "document", "localStorage", "navigator"],
    },
  },
  {
    files: ["apps/web/**/*.{ts,js}"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["content/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node } },
  },
);
