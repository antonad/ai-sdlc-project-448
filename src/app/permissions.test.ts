import { describe, expect, it } from "vitest";
import { calculateAccess } from "../domain/access";
import { addPermission, removePermission } from "./permissions";
import { seedConfig } from "./seed";

const accessOf = (config: typeof seedConfig, userId: string, serviceId: string) =>
  calculateAccess(config, { userId, serviceId, at: new Date("2026-01-01T00:00:00Z") });

describe("добавление разрешения", () => {
  it("добавляет постоянное разрешение пользователю и не трогает остальные", () => {
    const next = addPermission(seedConfig, { type: "user", id: "vera" }, "ledger");

    expect(next.permissions).toHaveLength(seedConfig.permissions.length + 1);
    expect(next.permissions.slice(0, seedConfig.permissions.length)).toEqual(
      seedConfig.permissions,
    );
    expect(accessOf(next, "vera", "ledger").granted).toBe(true);
  });

  it("добавляет разрешение группе, и доступ получают её участники", () => {
    const next = addPermission(seedConfig, { type: "group", id: "support" }, "ledger");

    expect(accessOf(next, "boris", "ledger").granted).toBe(true);
    expect(accessOf(next, "vera", "ledger").granted).toBe(false);
  });

  it("не создаёт дубль уже выданного разрешения", () => {
    const next = addPermission(seedConfig, { type: "user", id: "anna" }, "ledger");

    expect(next).toEqual(seedConfig);
  });

  it("пропускает занятый идентификатор, когда число разрешений не совпадает с номером", () => {
    const withoutFirst = removePermission(seedConfig, "p1");
    const next = addPermission(withoutFirst, { type: "user", id: "vera" }, "ledger");

    expect(next.permissions.at(-1)?.id).toBe("p6");
  });

  it("не мутирует исходную конфигурацию и выдаёт уникальные идентификаторы", () => {
    const before = structuredClone(seedConfig);
    const first = addPermission(seedConfig, { type: "user", id: "vera" }, "ledger");
    const second = addPermission(first, { type: "user", id: "vera" }, "mail");

    expect(seedConfig).toEqual(before);
    const ids = second.permissions.map((permission) => permission.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("отзыв разрешения", () => {
  it("убирает только выбранное разрешение", () => {
    const next = removePermission(seedConfig, "p1");

    expect(next.permissions.map((permission) => permission.id)).toEqual(["p2", "p3", "p4", "p5"]);
  });

  it("сохраняет независимый источник доступа того же сотрудника", () => {
    const next = removePermission(seedConfig, "p1");
    const result = accessOf(next, "anna", "ledger");

    expect(result.granted).toBe(true);
    expect(result.sources).toEqual([{ kind: "group", permissionId: "p2", groupId: "accounting" }]);
  });

  it("закрывает доступ, когда источник был единственным", () => {
    const next = removePermission(seedConfig, "p3");

    expect(accessOf(next, "boris", "repository").granted).toBe(false);
  });

  it("не меняет конфигурацию при неизвестном идентификаторе", () => {
    expect(removePermission(seedConfig, "missing")).toEqual(seedConfig);
  });

  // Требование СБ №3: удаление p3 меняет ровно одну запись.
  it("удаление p3 оставляет p1, p2, p4, p5, пользователей, группы и сервисы прежними", () => {
    const before = structuredClone(seedConfig);
    const next = removePermission(seedConfig, "p3");

    expect(next.permissions).toHaveLength(before.permissions.length - 1);
    expect(next.permissions).toEqual(
      before.permissions.filter((permission) => permission.id !== "p3"),
    );
    expect(next.users).toEqual(before.users);
    expect(next.groups).toEqual(before.groups);
    expect(next.services).toEqual(before.services);
    expect(seedConfig).toEqual(before);
  });

  // Требование СБ №4: у Анны два источника доступа к «Учёту».
  it("у Анны два источника в «Учёте», после удаления p1 остаётся только группа «Бухгалтерия»", () => {
    expect(accessOf(seedConfig, "anna", "ledger").sources).toEqual([
      { kind: "direct", permissionId: "p1" },
      { kind: "group", permissionId: "p2", groupId: "accounting" },
    ]);

    const result = accessOf(removePermission(seedConfig, "p1"), "anna", "ledger");

    expect(result).toEqual({
      granted: true,
      sources: [{ kind: "group", permissionId: "p2", groupId: "accounting" }],
    });
  });
});
