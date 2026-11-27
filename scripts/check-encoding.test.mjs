import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkRepository, findProblems } from "./check-encoding.mjs";

const russian = Buffer.from("Хранение конфигурации", "utf8");
// То, что делает `Get-Content | Set-Content -Encoding utf8` в Windows PowerShell 5.1.
const mojibake = Buffer.from(new TextDecoder("windows-1252").decode(russian), "utf8");

describe("findProblems", () => {
  it("принимает UTF-8 без BOM, в том числе с окончаниями CRLF", () => {
    expect(findProblems(russian)).toEqual([]);
    expect(findProblems(Buffer.from("Хранение\r\nконфигурации\r\n"))).toEqual([]);
  });

  it("ловит BOM", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), russian]);
    expect(findProblems(withBom)).toHaveLength(1);
  });

  it("ловит двойную перекодировку русского текста", () => {
    expect(findProblems(mojibake)).toHaveLength(1);
  });
});

describe("checkRepository", () => {
  it("называет файл с нарушением и пропускает журналы ревью", () => {
    const base = mkdtempSync(join(tmpdir(), "encoding-"));
    mkdirSync(join(base, "src"));
    mkdirSync(join(base, "docs", "reviews"), { recursive: true });
    writeFileSync(join(base, "src", "bad.test.ts"), mojibake);
    writeFileSync(join(base, "src", "good.ts"), russian);
    writeFileSync(join(base, "docs", "reviews", "old.md"), mojibake);
    const failures = checkRepository(base);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("src/bad.test.ts");
  });
});
