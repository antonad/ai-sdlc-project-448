import { describe, expect, it } from "vitest";
import { calculateAccess } from "../domain/access";
import {
  addPermission,
  carryOverRevocations,
  removePermission,
  revokePermissionFrom,
} from "./permissions";
import { seedConfig } from "./seed";

const accessOf = (config: typeof seedConfig, userId: string, serviceId: string) =>
  calculateAccess(config, { userId, serviceId, at: new Date("2026-01-01T00:00:00Z") });

const accessAt = (config: typeof seedConfig, userId: string, serviceId: string, moment: string) =>
  calculateAccess(config, { userId, serviceId, at: new Date(moment) });

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
      inactive: [],
    });
  });
});

describe("добавление разрешения со сроком", () => {
  const vera = { type: "user", id: "vera" } as const;
  const lastId = (config: typeof seedConfig) => config.permissions.at(-1);
  const interval = { startsAt: "2026-12-01T09:00Z", expiresAt: "2026-12-14T18:00Z" };

  it("выдаёт разрешение с интервалом и записывает обе границы", () => {
    const next = addPermission(seedConfig, vera, "ledger", interval);

    expect(next.permissions).toHaveLength(seedConfig.permissions.length + 1);
    expect(lastId(next)).toMatchObject({ subject: vera, serviceId: "ledger", ...interval });
  });

  it("выдаёт разрешение с одной границей без второго поля", () => {
    const onlyStart = lastId(
      addPermission(seedConfig, vera, "ledger", { startsAt: "2026-12-01T09:00Z" }),
    );
    const onlyEnd = lastId(
      addPermission(seedConfig, vera, "ledger", { expiresAt: "2026-12-14T18:00Z" }),
    );

    expect(onlyStart).not.toHaveProperty("expiresAt");
    expect(onlyStart).toHaveProperty("startsAt", "2026-12-01T09:00Z");
    expect(onlyEnd).not.toHaveProperty("startsAt");
    expect(onlyEnd).toHaveProperty("expiresAt", "2026-12-14T18:00Z");
  });

  it("постоянное разрешение не получает полей срока", () => {
    const permanent = lastId(addPermission(seedConfig, vera, "ledger"));

    expect(permanent).not.toHaveProperty("startsAt");
    expect(permanent).not.toHaveProperty("expiresAt");
  });

  it("повторная выдача с теми же границами возвращает ту же конфигурацию", () => {
    const once = addPermission(seedConfig, vera, "ledger", interval);

    expect(addPermission(once, vera, "ledger", interval)).toBe(once);
  });

  it("другой интервал на тот же сервис создаёт отдельную запись", () => {
    const once = addPermission(seedConfig, vera, "ledger", interval);
    const twice = addPermission(once, vera, "ledger", {
      startsAt: "2026-12-10T09:00Z",
      expiresAt: "2026-12-20T18:00Z",
    });

    expect(twice.permissions).toHaveLength(once.permissions.length + 1);
  });

  it("тот же день с другим временем считается другим интервалом", () => {
    const once = addPermission(seedConfig, vera, "ledger", interval);
    const twice = addPermission(once, vera, "ledger", {
      ...interval,
      expiresAt: "2026-12-14T19:00Z",
    });

    expect(twice.permissions).toHaveLength(once.permissions.length + 1);
  });

  it("постоянное и временное разрешения сосуществуют в любом порядке", () => {
    const permanentFirst = addPermission(
      addPermission(seedConfig, vera, "ledger"),
      vera,
      "ledger",
      interval,
    );
    const temporaryFirst = addPermission(
      addPermission(seedConfig, vera, "ledger", interval),
      vera,
      "ledger",
    );

    expect(permanentFirst.permissions).toHaveLength(seedConfig.permissions.length + 2);
    expect(temporaryFirst.permissions).toHaveLength(seedConfig.permissions.length + 2);
  });

  it("пустые строки и пробелы в границах значат «не задано»", () => {
    const blank = addPermission(seedConfig, vera, "ledger", { startsAt: "", expiresAt: "  " });

    expect(lastId(blank)).not.toHaveProperty("startsAt");
    expect(lastId(blank)).not.toHaveProperty("expiresAt");
    // Дубль с постоянным разрешением определяется по нормализованным границам.
    expect(addPermission(blank, vera, "ledger")).toBe(blank);
    expect(addPermission(blank, vera, "ledger", { startsAt: "", expiresAt: "" })).toBe(blank);
  });

  it("не мутирует исходную конфигурацию", () => {
    const before = structuredClone(seedConfig);

    addPermission(seedConfig, vera, "ledger", interval);

    expect(seedConfig).toEqual(before);
  });

  it("удаление разрешения со сроком снимает ровно эту запись", () => {
    const withTerm = addPermission(seedConfig, vera, "ledger", { expiresAt: "2026-12-14T18:00Z" });
    const id = lastId(withTerm)?.id ?? "";

    expect(removePermission(withTerm, id)).toEqual(seedConfig);
  });

  it("разрешение со сроком начинает действовать в минуту начала и заканчивается в минуту окончания", () => {
    const next = addPermission(seedConfig, vera, "ledger", interval);

    expect(accessAt(next, "vera", "ledger", "2026-12-01T08:59Z").granted).toBe(false);
    expect(accessAt(next, "vera", "ledger", "2026-12-01T09:00Z").granted).toBe(true);
    expect(accessAt(next, "vera", "ledger", "2026-12-14T17:59Z").granted).toBe(true);
    expect(accessAt(next, "vera", "ledger", "2026-12-14T18:00Z").granted).toBe(false);
  });
});

describe("отзыв разрешения с момента", () => {
  const vera = { type: "user", id: "vera" } as const;
  const withTerm = (interval: { startsAt?: string; expiresAt?: string }) => {
    const config = addPermission(seedConfig, vera, "ledger", interval);
    return { config, id: config.permissions.at(-1)?.id ?? "" };
  };
  // У учебных разрешений нет границ: для отзыва заменяем интервал выбранного.
  const withInterval = (id: string, interval: { startsAt?: string; expiresAt?: string }) => ({
    ...seedConfig,
    permissions: seedConfig.permissions.map((permission) =>
      permission.id === id ? { ...permission, ...interval } : permission,
    ),
  });
  const permissionOf = (config: typeof seedConfig, id: string) =>
    config.permissions.find((permission) => permission.id === id);
  const term = { startsAt: "2026-11-20T09:00Z", expiresAt: "2026-12-03T18:00Z" };

  it("записывает revokedAt, срок остаётся прежним", () => {
    const { config, id } = withTerm(term);

    const outcome = revokePermissionFrom(config, id, "2026-11-27T12:00Z");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)).toMatchObject({
      startsAt: "2026-11-20T09:00Z",
      expiresAt: "2026-12-03T18:00Z",
      revokedAt: "2026-11-27T12:00Z",
    });
  });

  it("до момента отзыва доступ есть, с момента отзыва и позже нет", () => {
    const { config, id } = withTerm(term);
    const { config: revoked } = revokePermissionFrom(config, id, "2026-11-27T12:00Z");

    expect(accessAt(revoked, "vera", "ledger", "2026-11-27T11:59Z").granted).toBe(true);
    for (const moment of ["2026-11-27T12:00Z", "2026-11-27T12:01Z", "2026-12-03T17:00Z"]) {
      const result = accessAt(revoked, "vera", "ledger", moment);
      expect(result.granted).toBe(false);
      expect(result.inactive).toEqual([
        { kind: "direct", permissionId: id, reason: "revoked", boundary: "2026-11-27T12:00Z" },
      ]);
    }
  });

  it("отзывает разрешение только с началом", () => {
    const { config, id } = withTerm({ startsAt: "2026-11-20T09:00Z" });

    const outcome = revokePermissionFrom(config, id, "2026-11-27T12:00Z");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)).toEqual({
      id,
      subject: vera,
      serviceId: "ledger",
      startsAt: "2026-11-20T09:00Z",
      revokedAt: "2026-11-27T12:00Z",
    });
  });

  it("отзывает разрешение только с окончанием", () => {
    const { config, id } = withTerm({ expiresAt: "2026-12-03T18:00Z" });

    const outcome = revokePermissionFrom(config, id, "2026-11-27T12:00Z");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)).toEqual({
      id,
      subject: vera,
      serviceId: "ledger",
      expiresAt: "2026-12-03T18:00Z",
      revokedAt: "2026-11-27T12:00Z",
    });
    expect(accessAt(outcome.config, "vera", "ledger", "2026-11-27T11:59Z").granted).toBe(true);
    expect(accessAt(outcome.config, "vera", "ledger", "2026-11-27T12:00Z").granted).toBe(false);
  });

  it("отзывает групповое разрешение, доступ участников группы закрывается с момента", () => {
    const config = withInterval("p5", { expiresAt: "2026-12-31T00:00Z" });

    const outcome = revokePermissionFrom(config, "p5", "2026-11-27T12:00Z");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, "p5")?.revokedAt).toBe("2026-11-27T12:00Z");
    expect(accessAt(outcome.config, "boris", "mail", "2026-11-27T11:59Z").granted).toBe(true);
    expect(accessAt(outcome.config, "boris", "mail", "2026-11-27T12:00Z").granted).toBe(false);
  });

  it("принимает момент в прошлом", () => {
    const config = withInterval("p3", { startsAt: "2019-01-01T00:00Z" });

    const outcome = revokePermissionFrom(config, "p3", "2020-01-10T08:30Z");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, "p3")?.revokedAt).toBe("2020-01-10T08:30Z");
  });

  it("отказывает для постоянного разрешения", () => {
    const outcome = revokePermissionFrom(seedConfig, "p3", "2026-11-27T12:00Z");

    expect(outcome.result).toBe("permanent");
    expect(outcome.config).toBe(seedConfig);
  });

  it("отказывает для уже отозванного разрешения", () => {
    const { config, id } = withTerm(term);
    const { config: revoked } = revokePermissionFrom(config, id, "2026-11-27T12:00Z");

    const outcome = revokePermissionFrom(revoked, id, "2026-11-28T12:00Z");

    expect(outcome.result).toBe("already-revoked");
    expect(outcome.config).toBe(revoked);
    expect(permissionOf(outcome.config, id)?.revokedAt).toBe("2026-11-27T12:00Z");
  });

  it("отказывает, если момент отзыва совпадает с началом или раньше него", () => {
    const { config, id } = withTerm(term);

    for (const moment of ["2026-11-20T09:00Z", "2026-11-20T08:59Z", "2026-11-10T09:00Z"]) {
      const outcome = revokePermissionFrom(config, id, moment);

      expect(outcome.result).toBe("not-after-start");
      expect(outcome.config).toBe(config);
    }
  });

  it("отзыв через минуту после начала принимается", () => {
    const { config, id } = withTerm(term);

    const outcome = revokePermissionFrom(config, id, "2026-11-20T09:01Z");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)?.revokedAt).toBe("2026-11-20T09:01Z");
  });

  it("отказывает, если разрешение и так закончится в момент отзыва или раньше", () => {
    const { config, id } = withTerm(term);

    for (const moment of ["2026-12-03T18:00Z", "2026-12-03T18:01Z", "2026-12-20T09:00Z"]) {
      const outcome = revokePermissionFrom(config, id, moment);

      expect(outcome.result).toBe("already-ended");
      expect(outcome.config).toBe(config);
    }
  });

  it("отзыв за минуту до окончания принимается", () => {
    const { config, id } = withTerm(term);

    const outcome = revokePermissionFrom(config, id, "2026-12-03T17:59Z");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)).toMatchObject({
      expiresAt: "2026-12-03T18:00Z",
      revokedAt: "2026-12-03T17:59Z",
    });
  });

  it("отказывает при пустом, неверном и несуществующем моменте", () => {
    const { config, id } = withTerm(term);
    const moments = [
      "",
      "2026-11-27",
      "27.11.2026 12:00",
      "2026-11-27 12:00",
      "2026-11-27T12:00",
      "2026-02-30T10:00Z",
      "2026-11-27T24:00Z",
      "2026-11-27T12:60Z",
      "ерунда",
    ];
    for (const moment of moments) {
      const outcome = revokePermissionFrom(config, id, moment);

      expect(outcome.result).toBe("invalid-moment");
      expect(outcome.config).toBe(config);
    }
  });

  it("неверный момент проверяется раньше, чем наличие разрешения", () => {
    expect(revokePermissionFrom(seedConfig, "missing", "ерунда").result).toBe("invalid-moment");
  });

  it("не меняет конфигурацию при неизвестном разрешении", () => {
    const outcome = revokePermissionFrom(seedConfig, "missing", "2026-11-27T12:00Z");

    expect(outcome.result).toBe("unknown-permission");
    expect(outcome.config).toBe(seedConfig);
  });

  it("постоянное разрешение проверяется раньше, чем уже отозванное", () => {
    const revokedPermanent = {
      ...seedConfig,
      permissions: seedConfig.permissions.map((permission) =>
        permission.id === "p3" ? { ...permission, revokedAt: "2026-11-01T00:00Z" } : permission,
      ),
    };

    expect(revokePermissionFrom(revokedPermanent, "p3", "2026-11-27T12:00Z").result).toBe(
      "permanent",
    );
  });

  it("уже отозванное проверяется раньше, чем момент до начала и после окончания", () => {
    const { config, id } = withTerm(term);
    const { config: revoked } = revokePermissionFrom(config, id, "2026-11-27T12:00Z");

    expect(revokePermissionFrom(revoked, id, "2026-11-10T09:00Z").result).toBe("already-revoked");
    expect(revokePermissionFrom(revoked, id, "2026-12-20T09:00Z").result).toBe("already-revoked");
  });

  // Требование СБ №3: отзыв меняет ровно одну запись.
  it("отзыв p3 оставляет p1, p2, p4, p5, пользователей, группы и сервисы прежними", () => {
    const config = withInterval("p3", { expiresAt: "2026-12-31T00:00Z" });
    const before = structuredClone(config);

    const { config: next } = revokePermissionFrom(config, "p3", "2026-11-27T12:00Z");

    expect(next.permissions).toHaveLength(before.permissions.length);
    expect(next.permissions.filter((permission) => permission.id !== "p3")).toEqual(
      before.permissions.filter((permission) => permission.id !== "p3"),
    );
    expect(permissionOf(next, "p3")).toEqual({
      ...permissionOf(before, "p3"),
      revokedAt: "2026-11-27T12:00Z",
    });
    expect(next.users).toEqual(before.users);
    expect(next.groups).toEqual(before.groups);
    expect(next.services).toEqual(before.services);
    expect(config).toEqual(before);
  });

  // Требование СБ №4: у Анны два источника доступа к «Учёту», отзыв одного не убирает второй.
  it("после отзыва p1 с 27.11.2026 12:00 доступ Анны в 12:00 остаётся через группу «Бухгалтерия»", () => {
    const config = withInterval("p1", { startsAt: "2026-11-20T09:00Z" });

    const { config: next } = revokePermissionFrom(config, "p1", "2026-11-27T12:00Z");

    const atRevoke = accessAt(next, "anna", "ledger", "2026-11-27T12:00Z");
    expect(atRevoke.granted).toBe(true);
    expect(atRevoke.sources).toEqual([
      { kind: "group", permissionId: "p2", groupId: "accounting" },
    ]);
    expect(atRevoke.inactive).toEqual([
      { kind: "direct", permissionId: "p1", reason: "revoked", boundary: "2026-11-27T12:00Z" },
    ]);
    expect(accessAt(next, "anna", "ledger", "2026-11-27T11:59Z").sources).toEqual([
      { kind: "direct", permissionId: "p1" },
      { kind: "group", permissionId: "p2", groupId: "accounting" },
    ]);
  });
});

describe("перенос отзывов при импорте", () => {
  const term = { startsAt: "2026-11-20T09:00Z", expiresAt: "2026-12-03T18:00Z" };
  const withTerm = (revokedAt?: string) => ({
    ...seedConfig,
    permissions: [
      ...seedConfig.permissions,
      {
        id: "p6",
        subject: { type: "user" as const, id: "anna" },
        serviceId: "repository",
        ...term,
        ...(revokedAt === undefined ? {} : { revokedAt }),
      },
    ],
  });
  const p6 = (config: typeof seedConfig) => config.permissions.find(({ id }) => id === "p6");

  it("переносит отзыв на то же разрешение из файла, и доступ остаётся закрытым", () => {
    const current = withTerm("2026-11-27T12:00Z");
    const next = carryOverRevocations(current, withTerm());

    expect(p6(next)?.revokedAt).toBe("2026-11-27T12:00Z");
    expect(accessAt(next, "anna", "repository", "2026-11-28T10:00Z").granted).toBe(false);
  });

  it("без отзыва в текущей конфигурации возвращает ту же ссылку, доступ внутри интервала есть", () => {
    const imported = withTerm();
    const next = carryOverRevocations(withTerm(), imported);

    expect(next).toBe(imported);
    expect(accessAt(next, "anna", "repository", "2026-11-28T10:00Z").granted).toBe(true);
  });

  it("не переносит отзыв на другую выдачу под тем же идентификатором", () => {
    const current = withTerm("2026-11-27T12:00Z");
    const other = withTerm();
    const variants = [
      { serviceId: "mail" },
      { subject: { type: "user" as const, id: "boris" } },
      { startsAt: "2026-11-21T09:00Z" },
      { expiresAt: "2026-12-04T18:00Z" },
    ];
    for (const change of variants) {
      const imported = {
        ...other,
        permissions: other.permissions.map((item) =>
          item.id === "p6" ? { ...item, ...change } : item,
        ),
      };

      expect(carryOverRevocations(current, imported)).toBe(imported);
    }
  });

  it("при двух отзывах действует более ранний", () => {
    const early = carryOverRevocations(
      withTerm("2026-11-25T12:00Z"),
      withTerm("2026-11-27T12:00Z"),
    );
    const late = carryOverRevocations(withTerm("2026-11-27T12:00Z"), withTerm("2026-11-25T12:00Z"));

    expect(p6(early)?.revokedAt).toBe("2026-11-25T12:00Z");
    expect(p6(late)?.revokedAt).toBe("2026-11-25T12:00Z");
  });

  it("меняет только совпавшее разрешение, остальное берёт из файла, исходные объекты целы", () => {
    const current = withTerm("2026-11-27T12:00Z");
    const imported = { ...withTerm(), permissions: withTerm().permissions.slice(1) };
    const snapshot = structuredClone(imported);
    const next = carryOverRevocations(current, imported);

    expect(next.permissions.map(({ id }) => id)).toEqual(["p2", "p3", "p4", "p5", "p6"]);
    expect(next.permissions.slice(0, 4)).toEqual(imported.permissions.slice(0, 4));
    expect(next.users).toEqual(imported.users);
    expect(imported).toEqual(snapshot);
  });
});
