import { describe, expect, it } from "vitest";
import type { Config, Permission } from "../domain/model";
import { buildImportPreview } from "./import-preview";
import { seedConfig } from "./seed";

const timed: Permission = {
  id: "p6",
  subject: { type: "user", id: "vera" },
  serviceId: "ledger",
  startsAt: "2026-11-20T09:00Z",
  expiresAt: "2026-12-03T18:00Z",
};
const revoked: Permission = { ...timed, revokedAt: "2026-11-27T07:00Z" };

const withPermissions = (...permissions: Permission[]): Config => ({
  ...seedConfig,
  permissions,
});

describe("buildImportPreview", () => {
  it("файл, равный текущей конфигурации, ничего не меняет", () => {
    const preview = buildImportPreview(seedConfig, structuredClone(seedConfig));

    expect(preview).toMatchObject({ added: [], removed: [], changed: [], kept: [], empty: true });
    expect(preview.entities).toEqual([]);
  });

  it("называет добавленные, убранные и изменённые разрешения", () => {
    const current = withPermissions(...seedConfig.permissions.slice(0, 4), timed);
    const imported: Config = {
      ...seedConfig,
      permissions: seedConfig.permissions.map((permission) =>
        permission.id === "p3" ? { ...permission, serviceId: "mail" } : permission,
      ),
    };
    const preview = buildImportPreview(current, imported);

    expect(preview.added.map(({ id }) => id)).toEqual(["p5"]);
    expect(preview.removed.map(({ id }) => id)).toEqual(["p6"]);
    expect(preview.changed.map(({ before, after }) => [before.serviceId, after.serviceId])).toEqual(
      [["repository", "mail"]],
    );
    expect(preview.kept).toEqual([]);
    expect(preview.empty).toBe(false);
  });

  it("результат равен файлу, если отзывов нет", () => {
    const imported = withPermissions(seedConfig.permissions[4]);

    expect(buildImportPreview(seedConfig, imported).result).toEqual(imported);
  });

  it("отзыв, которого нет в файле, сохраняется и не считается ни убранным, ни изменённым", () => {
    const preview = buildImportPreview(withPermissions(revoked), withPermissions(timed));

    expect(preview.kept).toEqual([revoked]);
    expect(preview.added).toEqual([]);
    expect(preview.removed).toEqual([]);
    expect(preview.changed).toEqual([]);
    expect(preview.empty).toBe(false);
    expect(preview.result.permissions).toEqual([revoked]);
  });

  it("отзыв, который позже отзыва в файле, сохраняется как есть из текущей конфигурации", () => {
    const later = { ...timed, revokedAt: "2026-12-01T00:00Z" };
    const preview = buildImportPreview(withPermissions(revoked), withPermissions(later));

    expect(preview.kept).toEqual([revoked]);
    expect(preview.changed).toEqual([]);
  });

  it("более ранний отзыв из файла меняет разрешение и не считается сохранённым", () => {
    const earlier = { ...timed, revokedAt: "2026-11-25T00:00Z" };
    const preview = buildImportPreview(withPermissions(revoked), withPermissions(earlier));

    expect(preview.kept).toEqual([]);
    expect(preview.changed).toEqual([{ before: revoked, after: earlier }]);
  });

  it("одинаковый отзыв в файле и в конфигурации различием не считается", () => {
    const preview = buildImportPreview(withPermissions(revoked), withPermissions(revoked));

    expect(preview.empty).toBe(true);
  });

  it("другая выдача под тем же id: отзыв не переносится, разрешение изменено", () => {
    const other = { ...timed, expiresAt: "2026-12-10T18:00Z" };
    const preview = buildImportPreview(withPermissions(revoked), withPermissions(other));

    expect(preview.kept).toEqual([]);
    expect(preview.changed).toEqual([{ before: revoked, after: other }]);
    expect(preview.result.permissions).toEqual([other]);
  });

  it("считает различия пользователей, групп и сервисов отдельно от разрешений", () => {
    const imported: Config = {
      ...seedConfig,
      users: [
        { ...seedConfig.users[0], name: "Анна Белова-Иванова" },
        { ...seedConfig.users[1], groupIds: ["support", "development"] },
        { id: "new", name: "Новый", groupIds: [] },
      ],
      groups: seedConfig.groups.slice(0, 2),
      services: seedConfig.services,
    };
    const preview = buildImportPreview(seedConfig, imported);

    expect(preview.entities).toEqual([
      { kind: "users", added: 1, removed: 1, changed: 2 },
      { kind: "groups", added: 0, removed: 1, changed: 0 },
    ]);
    expect(preview.empty).toBe(false);
  });

  it("порядок групп пользователя различием не считается", () => {
    const current: Config = {
      ...seedConfig,
      users: [{ id: "anna", name: "Анна Белова", groupIds: ["accounting", "support"] }],
    };
    const imported: Config = {
      ...current,
      users: [{ id: "anna", name: "Анна Белова", groupIds: ["support", "accounting"] }],
    };

    expect(buildImportPreview(current, imported).entities).toEqual([]);
  });

  it("не меняет переданные конфигурации", () => {
    const current = withPermissions(revoked);
    const imported = withPermissions(timed);
    const before = structuredClone([current, imported]);

    buildImportPreview(current, imported);

    expect([current, imported]).toEqual(before);
  });
});
