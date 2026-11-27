import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Тесты идут в часовом поясе UTC+5 без летнего времени: пропущенный перевод между локальным
// временем и UTC не прячется при поясе машины UTC. Воркеры наследуют переменную окружения.
process.env.TZ = "Asia/Yekaterinburg";

// GitHub Pages отдаёт сайт из каталога с именем репозитория, поэтому пути к файлам относительные.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { host: true, port: 8080, allowedHosts: true },
  preview: { host: true, port: 8080, allowedHosts: true },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-setup.ts", "src/main.tsx"],
      reporter: ["text", "html"],
      thresholds: { lines: 95, statements: 95, branches: 90, functions: 95 },
    },
  },
});
