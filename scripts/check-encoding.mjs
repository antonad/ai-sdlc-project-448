// Проверка кодировки текстовых файлов: без BOM и без двойной перекодировки UTF-8. CR не
// проверяем: рабочая копия на Windows бывает в CRLF, а git нормализует её в LF при коммите.
// Причина: массовая правка через `Get-Content`/`Set-Content` в Windows PowerShell 5.1 читает UTF-8
// как ANSI и пишет BOM. Запуск: `node scripts/check-encoding.mjs` (входит в `npm run lint`).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOTS = ["src", "docs", "openspec", "rules", "scripts", ".claude", ".github"];
const ROOT_FILES = ["README.md", "CLAUDE.md", "index.html", "Makefile", "package.json"];
const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mjs",
  ".md",
  ".yml",
  ".yaml",
  ".json",
  ".html",
  ".css",
]);
// Журналы ревью и ретро цитируют испорченный текст как пример: их не проверяем.
const SKIPPED = ["docs/reviews/", "docs/retro/", "node_modules/"];

// Кириллица, прочитанная как windows-1252 и записанная заново: заглавная D или N с акцентом (U+00D0, U+00D1) и за ней символ
// из диапазона 0x80-0xBF или из верхней части windows-1252.
// Строка, а не литерал: форматтер раскрывает escape-последовательности в литерале regexp.
const MOJIBAKE = new RegExp(
  "[\\u00D0\\u00D1][\\u0080-\\u00BF\\u0152\\u0153\\u0160\\u0161\\u0178\\u017D\\u017E\\u0192\\u02C6\\u02DC" +
    "\\u2013\\u2014\\u2018-\\u201E\\u2020-\\u2022\\u2026\\u2030\\u2039\\u203A\\u20AC\\u2122]",
);

export function findProblems(bytes) {
  const problems = [];
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    problems.push("BOM в начале файла, нужен UTF-8 без BOM");
  }
  if (MOJIBAKE.test(Buffer.from(bytes).toString("utf8"))) {
    problems.push(
      "двойная перекодировка UTF-8: русский текст превратился в набор латинских символов с акцентами",
    );
  }
  return problems;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

export function checkRepository(base) {
  const files = ROOT_FILES.map((file) => join(base, file));
  for (const root of ROOTS) {
    try {
      files.push(...walk(join(base, root)));
    } catch {
      // Папки может не быть.
    }
  }
  const failures = [];
  for (const file of files) {
    const name = relative(base, file).split(sep).join("/");
    const skipped = SKIPPED.some((part) => name.startsWith(part) || name.includes(`/${part}`));
    if (skipped || !(EXTENSIONS.has(extname(file)) || ROOT_FILES.includes(name))) {
      continue;
    }
    let bytes;
    try {
      bytes = readFileSync(file);
    } catch {
      continue;
    }
    for (const problem of findProblems(bytes)) {
      failures.push(`${name}: ${problem}`);
    }
  }
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkRepository(process.cwd());
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    console.error(
      "Исправьте через Edit/Write или восстановите файл из git; не правьте через Get-Content/Set-Content.",
    );
    process.exit(1);
  }
}
