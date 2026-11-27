import { describe, expect, it } from "vitest";
import { calculateAccess } from "../domain/access";
import { momentToDate } from "./dates";
import { addPermission, removePermission, revokePermissionFrom } from "./permissions";
import { seedConfig } from "./seed";

const accessOf = (config: typeof seedConfig, userId: string, serviceId: string) =>
  calculateAccess(config, { userId, serviceId, at: new Date("2026-01-01T00:00:00Z") });

const accessAt = (config: typeof seedConfig, userId: string, serviceId: string, moment: string) =>
  calculateAccess(config, { userId, serviceId, at: momentToDate(moment) });

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
  const interval = { startsAt: "2026-12-01T09:00", expiresAt: "2026-12-14T18:00" };

  it("выдаёт разрешение с интервалом и записывает обе границы", () => {
    const next = addPermission(seedConfig, vera, "ledger", interval);

    expect(next.permissions).toHaveLength(seedConfig.permissions.length + 1);
    expect(lastId(next)).toMatchObject({ subject: vera, serviceId: "ledger", ...interval });
  });

  it("выдаёт разрешение с одной границей без второго поля", () => {
    const onlyStart = lastId(
      addPermission(seedConfig, vera, "ledger", { startsAt: "2026-12-01T09:00" }),
    );
    const onlyEnd = lastId(
      addPermission(seedConfig, vera, "ledger", { expiresAt: "2026-12-14T18:00" }),
    );

    expect(onlyStart).not.toHaveProperty("expiresAt");
    expect(onlyStart).toHaveProperty("startsAt", "2026-12-01T09:00");
    expect(onlyEnd).not.toHaveProperty("startsAt");
    expect(onlyEnd).toHaveProperty("expiresAt", "2026-12-14T18:00");
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
      startsAt: "2026-12-10T09:00",
      expiresAt: "2026-12-20T18:00",
    });

    expect(twice.permissions).toHaveLength(once.permissions.length + 1);
  });

  it("тот же день с другим временем считается другим интервалом", () => {
    const once = addPermission(seedConfig, vera, "ledger", interval);
    const twice = addPermission(once, vera, "ledger", {
      ...interval,
      expiresAt: "2026-12-14T19:00",
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
    const withTerm = addPermission(seedConfig, vera, "ledger", { expiresAt: "2026-12-14T18:00" });
    const id = lastId(withTerm)?.id ?? "";

    expect(removePermission(withTerm, id)).toEqual(seedConfig);
  });

  it("разрешение со сроком начинает действовать в минуту начала и заканчивается в минуту окончания", () => {
    const next = addPermission(seedConfig, vera, "ledger", interval);

    expect(accessAt(next, "vera", "ledger", "2026-12-01T08:59").granted).toBe(false);
    expect(accessAt(next, "vera", "ledger", "2026-12-01T09:00").granted).toBe(true);
    expect(accessAt(next, "vera", "ledger", "2026-12-14T17:59").granted).toBe(true);
    expect(accessAt(next, "vera", "ledger", "2026-12-14T18:00").granted).toBe(false);
  });
});

describe("отзыв разрешения с момента", () => {
  const vera = { type: "user", id: "vera" } as const;
  const withTerm = (interval: { startsAt?: string; expiresAt?: string }) => {
    const config = addPermission(seedConfig, vera, "ledger", interval);
    return { config, id: config.permissions.at(-1)?.id ?? "" };
  };
  const permissionOf = (config: typeof seedConfig, id: string) =>
    config.permissions.find((permission) => permission.id === id);
  const term = { startsAt: "2026-11-20T09:00", expiresAt: "2026-12-03T18:00" };

  it("сокращает окончание разрешения со сроком до момента отзыва", () => {
    const { config, id } = withTerm(term);

    const outcome = revokePermissionFrom(config, id, "2026-11-27T12:00");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)).toMatchObject({
      startsAt: "2026-11-20T09:00",
      expiresAt: "2026-11-27T12:00",
    });
  });

  it("до момента отзыва доступ есть, с момента отзыва и позже закончился", () => {
    const { config, id } = withTerm(term);
    const { config: revoked } = revokePermissionFrom(config, id, "2026-11-27T12:00");

    expect(accessAt(revoked, "vera", "ledger", "2026-11-27T11:59").granted).toBe(true);
    for (const moment of ["2026-11-27T12:00", "2026-11-27T12:01", "2026-12-03T17:00"]) {
      const result = accessAt(revoked, "vera", "ledger", moment);
      expect(result.granted).toBe(false);
      expect(result.inactive).toEqual([
        { kind: "direct", permissionId: id, reason: "expired", boundary: "2026-11-27T12:00" },
      ]);
    }
  });

  it("отзывает бессрочное разрешение: появляется только окончание", () => {
    const outcome = revokePermissionFrom(seedConfig, "p3", "2026-11-27T12:00");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, "p3")).toEqual({
      id: "p3",
      subject: { type: "user", id: "boris" },
      serviceId: "repository",
      expiresAt: "2026-11-27T12:00",
    });
    expect(accessAt(outcome.config, "boris", "repository", "2026-11-27T11:59").granted).toBe(true);
    expect(accessAt(outcome.config, "boris", "repository", "2026-11-27T12:00").granted).toBe(false);
  });

  it("отзывает разрешение только с началом", () => {
    const { config, id } = withTerm({ startsAt: "2026-11-20T09:00" });

    const outcome = revokePermissionFrom(config, id, "2026-11-27T12:00");

    expect(permissionOf(outcome.config, id)).toMatchObject({
      startsAt: "2026-11-20T09:00",
      expiresAt: "2026-11-27T12:00",
    });
  });

  it("отзыв в полночь записывается целиком, без переноса на прошлый день", () => {
    const outcome = revokePermissionFrom(seedConfig, "p3", "2027-01-01T00:00");

    expect(permissionOf(outcome.config, "p3")?.expiresAt).toBe("2027-01-01T00:00");
  });

  it("отзывает групповое разрешение, доступ участников группы закрывается с момента", () => {
    const outcome = revokePermissionFrom(seedConfig, "p5", "2026-11-27T12:00");

    expect(permissionOf(outcome.config, "p5")?.expiresAt).toBe("2026-11-27T12:00");
    expect(accessAt(outcome.config, "boris", "mail", "2026-11-27T11:59").granted).toBe(true);
    expect(accessAt(outcome.config, "boris", "mail", "2026-11-27T12:00").granted).toBe(false);
  });

  it("отказывает, если момент отзыва совпадает с началом или раньше него", () => {
    const { config, id } = withTerm(term);

    for (const moment of ["2026-11-20T09:00", "2026-11-20T08:59", "2026-11-10T09:00"]) {
      const outcome = revokePermissionFrom(config, id, moment);

      expect(outcome.result).toBe("not-after-start");
      expect(outcome.config).toBe(config);
    }
  });

  it("отзыв через минуту после начала оставляет одну минуту действия", () => {
    const { config, id } = withTerm(term);

    const outcome = revokePermissionFrom(config, id, "2026-11-20T09:01");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)).toMatchObject({ expiresAt: "2026-11-20T09:01" });
  });

  it("отказывает, если разрешение и так закончится в момент отзыва или раньше", () => {
    const { config, id } = withTerm(term);

    for (const moment of ["2026-12-03T18:00", "2026-12-03T18:01", "2026-12-20T09:00"]) {
      const outcome = revokePermissionFrom(config, id, moment);

      expect(outcome.result).toBe("already-ended");
      expect(outcome.config).toBe(config);
    }
  });

  it("отзыв за минуту до окончания сокращает срок на эту минуту", () => {
    const { config, id } = withTerm(term);

    const outcome = revokePermissionFrom(config, id, "2026-12-03T17:59");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)).toMatchObject({ expiresAt: "2026-12-03T17:59" });
  });

  it("отказывает при пустом, неверном и несуществующем моменте", () => {
    const moments = [
      "",
      "2026-11-27",
      "27.11.2026 12:00",
      "2026-11-27 12:00",
      "2026-02-30T10:00",
      "2026-11-27T24:00",
      "2026-11-27T12:60",
      "ерунда",
    ];
    for (const moment of moments) {
      const outcome = revokePermissionFrom(seedConfig, "p3", moment);

      expect(outcome.result).toBe("invalid-moment");
      expect(outcome.config).toBe(seedConfig);
    }
  });

  it("неверный момент проверяется раньше, чем наличие разрешения", () => {
    expect(revokePermissionFrom(seedConfig, "missing", "ерунда").result).toBe("invalid-moment");
  });

  it("не меняет конфигурацию при неизвестном разрешении", () => {
    const outcome = revokePermissionFrom(seedConfig, "missing", "2026-11-27T12:00");

    expect(outcome.result).toBe("unknown-permission");
    expect(outcome.config).toBe(seedConfig);
  });

  // Требование СБ №3: отзыв меняет ровно одну запись.
  it("отзыв p3 оставляет p1, p2, p4, p5, пользователей, группы и сервисы прежними", () => {
    const before = structuredClone(seedConfig);

    const { config: next } = revokePermissionFrom(seedConfig, "p3", "2026-11-27T12:00");

    expect(next.permissions).toHaveLength(before.permissions.length);
    expect(next.permissions.filter((permission) => permission.id !== "p3")).toEqual(
      before.permissions.filter((permission) => permission.id !== "p3"),
    );
    expect(next.users).toEqual(before.users);
    expect(next.groups).toEqual(before.groups);
    expect(next.services).toEqual(before.services);
    expect(seedConfig).toEqual(before);
  });

  // Требование СБ №4: у Анны два источника доступа к «Учёту».
  it("после отзыва p1 с 27.11.2026 12:00 доступ Анны в 12:00 остаётся через группу «Бухгалтерия»", () => {
    const { config: next } = revokePermissionFrom(seedConfig, "p1", "2026-11-27T12:00");

    const atRevoke = accessAt(next, "anna", "ledger", "2026-11-27T12:00");
    expect(atRevoke.granted).toBe(true);
    expect(atRevoke.sources).toEqual([
      { kind: "group", permissionId: "p2", groupId: "accounting" },
    ]);
    expect(atRevoke.inactive).toEqual([
      { kind: "direct", permissionId: "p1", reason: "expired", boundary: "2026-11-27T12:00" },
    ]);
    expect(accessAt(next, "anna", "ledger", "2026-11-27T11:59").sources).toEqual([
      { kind: "direct", permissionId: "p1" },
      { kind: "group", permissionId: "p2", groupId: "accounting" },
    ]);
  });

  it("принимает момент в прошлом", () => {
    const outcome = revokePermissionFrom(seedConfig, "p3", "2020-01-10T08:30");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, "p3")?.expiresAt).toBe("2020-01-10T08:30");
  });
});
