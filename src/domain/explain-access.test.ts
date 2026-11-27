import { describe, expect, it } from "vitest";
import { calculateAccess, explainAccess } from "./access";
import type { Config } from "./model";

const config: Config = {
  users: [
    { id: "anna", name: "Анна Белова", groupIds: ["accounting"] },
    { id: "boris", name: "Борис Каримов", groupIds: [] },
  ],
  groups: [
    { id: "accounting", name: "Бухгалтерия" },
    { id: "support", name: "Поддержка" },
  ],
  services: [
    { id: "ledger", name: "Учёт" },
    { id: "mail", name: "Почта" },
  ],
  permissions: [
    { id: "g1", subject: { type: "group", id: "accounting" }, serviceId: "ledger" },
    {
      id: "d1",
      subject: { type: "user", id: "anna" },
      serviceId: "ledger",
      startsAt: "2026-03-10T00:00Z",
      expiresAt: "2026-03-20T00:00Z",
    },
    { id: "other-service", subject: { type: "user", id: "anna" }, serviceId: "mail" },
    { id: "other-user", subject: { type: "user", id: "boris" }, serviceId: "ledger" },
    { id: "other-group", subject: { type: "group", id: "support" }, serviceId: "ledger" },
  ],
};

const explain = (iso: string, c: Config = config, userId = "anna", serviceId = "ledger") =>
  explainAccess(c, { userId, serviceId, at: new Date(iso) });

describe("explainAccess", () => {
  it("перечисляет прямые разрешения раньше групповых и пропускает чужие", () => {
    const items = explain("2026-03-15T12:00:00Z");

    expect(items.map((item) => item.permissionId)).toEqual(["d1", "g1"]);
    expect(items[0]).toMatchObject({ kind: "direct", status: "active" });
    expect(items[1]).toMatchObject({ kind: "group", groupId: "accounting", status: "active" });
  });

  it("называет ещё не начавшееся разрешение pending с границей начала", () => {
    const [direct] = explain("2026-03-01T12:00:00Z");

    expect(direct).toMatchObject({
      permissionId: "d1",
      status: "pending",
      boundary: "2026-03-10T00:00Z",
    });
  });

  it("называет разрешение с наступившим окончанием expired", () => {
    const [direct] = explain("2026-03-20T00:00:00Z");

    expect(direct).toMatchObject({ status: "expired", boundary: "2026-03-20T00:00Z" });
  });

  it("называет отозванное разрешение revoked, пока срок ещё не вышел", () => {
    const revoked: Config = {
      ...config,
      permissions: config.permissions.map((permission) =>
        permission.id === "d1" ? { ...permission, revokedAt: "2026-03-15T00:00Z" } : permission,
      ),
    };

    expect(explain("2026-03-14T23:59:00Z", revoked)[0]).toMatchObject({ status: "active" });
    expect(explain("2026-03-15T00:00:00Z", revoked)[0]).toMatchObject({
      status: "revoked",
      boundary: "2026-03-15T00:00Z",
    });
  });

  it("при отзыве позже окончания после окончания даёт expired", () => {
    const afterExpiry: Config = {
      ...config,
      permissions: config.permissions.map((permission) =>
        permission.id === "d1" ? { ...permission, revokedAt: "2026-03-25T00:00Z" } : permission,
      ),
    };

    expect(explain("2026-03-22T00:00:00Z", afterExpiry)[0]).toMatchObject({ status: "expired" });
  });

  it("при отзыве раньше начала до начала даёт pending", () => {
    const early: Config = {
      ...config,
      permissions: config.permissions.map((permission) =>
        permission.id === "d1" ? { ...permission, revokedAt: "2026-03-12T00:00Z" } : permission,
      ),
    };
    // Отзыв 12 марта позже начала 10 марта; до начала приоритет у pending.
    expect(explain("2026-03-05T00:00:00Z", early)[0]).toMatchObject({ status: "pending" });
    expect(explain("2026-03-12T00:00:00Z", early)[0]).toMatchObject({ status: "revoked" });
  });

  it("постоянное разрешение группы действует, когда временное прямое уже истекло", () => {
    const items = explain("2040-01-01T00:00:00Z");

    expect(items.find((item) => item.permissionId === "d1")).toMatchObject({ status: "expired" });
    expect(items.find((item) => item.permissionId === "g1")).toMatchObject({ status: "active" });
  });

  it("не называет разрешений для пары без них", () => {
    expect(explain("2026-03-15T12:00:00Z", config, "boris", "mail")).toEqual([]);
  });

  it("не называет разрешений неизвестному сотруднику", () => {
    expect(explain("2026-03-15T12:00:00Z", config, "nobody", "mail")).toEqual([]);
  });

  it("согласован с calculateAccess: источники равны строкам active, остальные неактивны", () => {
    for (const iso of [
      "2026-03-01T12:00:00Z",
      "2026-03-10T00:00:00Z",
      "2026-03-15T12:00:00Z",
      "2026-03-20T00:00:00Z",
    ]) {
      const at = new Date(iso);
      const items = explainAccess(config, { userId: "anna", serviceId: "ledger", at });
      const result = calculateAccess(config, { userId: "anna", serviceId: "ledger", at });

      const active = items.filter((item) => item.status === "active");
      expect(result.granted).toBe(active.length > 0);
      expect(result.sources.map((source) => source.permissionId)).toEqual(
        active.map((item) => item.permissionId),
      );
      expect(result.inactive.map((item) => item.permissionId)).toEqual(
        items.filter((item) => item.status !== "active").map((item) => item.permissionId),
      );
    }
  });

  it("не меняет конфигурацию", () => {
    const before = JSON.stringify(config);

    explain("2026-03-15T12:00:00Z");

    expect(JSON.stringify(config)).toBe(before);
  });
});
