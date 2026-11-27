import { describe, expect, it } from "vitest";
import { calculateAccess } from "../domain/access";
import { addPermission, removePermission, revokePermissionFrom } from "./permissions";
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
      inactive: [],
    });
  });
});

describe("добавление разрешения со сроком", () => {
  const vera = { type: "user", id: "vera" } as const;
  const lastId = (config: typeof seedConfig) => config.permissions.at(-1);

  it("выдаёт разрешение с интервалом и записывает обе границы", () => {
    const next = addPermission(seedConfig, vera, "ledger", {
      startsOn: "2026-12-01",
      endsOn: "2026-12-14",
    });

    expect(next.permissions).toHaveLength(seedConfig.permissions.length + 1);
    expect(lastId(next)).toMatchObject({
      subject: vera,
      serviceId: "ledger",
      startsOn: "2026-12-01",
      endsOn: "2026-12-14",
    });
  });

  it("выдаёт разрешение с одной границей без второго поля", () => {
    const onlyStart = lastId(addPermission(seedConfig, vera, "ledger", { startsOn: "2026-12-01" }));
    const onlyEnd = lastId(addPermission(seedConfig, vera, "ledger", { endsOn: "2026-12-14" }));

    expect(onlyStart).not.toHaveProperty("endsOn");
    expect(onlyStart).toHaveProperty("startsOn", "2026-12-01");
    expect(onlyEnd).not.toHaveProperty("startsOn");
    expect(onlyEnd).toHaveProperty("endsOn", "2026-12-14");
  });

  it("постоянное разрешение не получает полей срока", () => {
    const permanent = lastId(addPermission(seedConfig, vera, "ledger"));

    expect(permanent).not.toHaveProperty("startsOn");
    expect(permanent).not.toHaveProperty("endsOn");
  });

  it("повторная выдача с теми же границами возвращает ту же конфигурацию", () => {
    const interval = { startsOn: "2026-12-01", endsOn: "2026-12-14" };
    const once = addPermission(seedConfig, vera, "ledger", interval);

    expect(addPermission(once, vera, "ledger", interval)).toBe(once);
  });

  it("другой интервал на тот же сервис создаёт отдельную запись", () => {
    const once = addPermission(seedConfig, vera, "ledger", {
      startsOn: "2026-12-01",
      endsOn: "2026-12-14",
    });
    const twice = addPermission(once, vera, "ledger", {
      startsOn: "2026-12-10",
      endsOn: "2026-12-20",
    });

    expect(twice.permissions).toHaveLength(once.permissions.length + 1);
  });

  it("постоянное и временное разрешения сосуществуют в любом порядке", () => {
    const interval = { startsOn: "2026-12-01", endsOn: "2026-12-14" };
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
    const blank = addPermission(seedConfig, vera, "ledger", { startsOn: "", endsOn: "  " });

    expect(lastId(blank)).not.toHaveProperty("startsOn");
    expect(lastId(blank)).not.toHaveProperty("endsOn");
    // Дубль с постоянным разрешением определяется по нормализованным границам.
    expect(addPermission(blank, vera, "ledger")).toBe(blank);
    expect(addPermission(blank, vera, "ledger", { startsOn: "", endsOn: "" })).toBe(blank);
  });

  it("не мутирует исходную конфигурацию", () => {
    const before = structuredClone(seedConfig);

    addPermission(seedConfig, vera, "ledger", { startsOn: "2026-12-01", endsOn: "2026-12-14" });

    expect(seedConfig).toEqual(before);
  });

  it("удаление разрешения со сроком снимает ровно эту запись", () => {
    const withTerm = addPermission(seedConfig, vera, "ledger", { endsOn: "2026-12-14" });
    const id = lastId(withTerm)?.id ?? "";

    expect(removePermission(withTerm, id)).toEqual(seedConfig);
  });
});

describe("отзыв разрешения с даты", () => {
  const vera = { type: "user", id: "vera" } as const;
  const withTerm = (interval: { startsOn?: string; endsOn?: string }) => {
    const config = addPermission(seedConfig, vera, "ledger", interval);
    return { config, id: config.permissions.at(-1)?.id ?? "" };
  };
  const permissionOf = (config: typeof seedConfig, id: string) =>
    config.permissions.find((permission) => permission.id === id);
  const accessOn = (config: typeof seedConfig, userId: string, serviceId: string, day: string) =>
    calculateAccess(config, { userId, serviceId, at: new Date(`${day}T12:00:00`) });

  it("сокращает окончание разрешения со сроком до дня перед датой отзыва", () => {
    const { config, id } = withTerm({ startsOn: "2026-11-20", endsOn: "2026-12-03" });

    const outcome = revokePermissionFrom(config, id, "2026-11-27");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)).toMatchObject({
      startsOn: "2026-11-20",
      endsOn: "2026-11-26",
    });
  });

  it("до даты отзыва доступ есть, с даты отзыва и позже закончился 26.11.2026", () => {
    const { config, id } = withTerm({ startsOn: "2026-11-20", endsOn: "2026-12-03" });
    const { config: revoked } = revokePermissionFrom(config, id, "2026-11-27");

    expect(accessOn(revoked, "vera", "ledger", "2026-11-26").granted).toBe(true);
    for (const day of ["2026-11-27", "2026-11-28", "2026-12-03"]) {
      const result = accessOn(revoked, "vera", "ledger", day);
      expect(result.granted).toBe(false);
      expect(result.inactive).toEqual([
        { kind: "direct", permissionId: id, reason: "expired", date: "2026-11-26" },
      ]);
    }
  });

  it("отзывает бессрочное разрешение: появляется только окончание", () => {
    const outcome = revokePermissionFrom(seedConfig, "p3", "2026-11-27");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, "p3")).toEqual({
      id: "p3",
      subject: { type: "user", id: "boris" },
      serviceId: "repository",
      endsOn: "2026-11-26",
    });
    expect(accessOn(outcome.config, "boris", "repository", "2026-11-26").granted).toBe(true);
    expect(accessOn(outcome.config, "boris", "repository", "2026-11-27").granted).toBe(false);
  });

  it("отзывает разрешение только с началом", () => {
    const { config, id } = withTerm({ startsOn: "2026-11-20" });

    const outcome = revokePermissionFrom(config, id, "2026-11-27");

    expect(permissionOf(outcome.config, id)).toMatchObject({
      startsOn: "2026-11-20",
      endsOn: "2026-11-26",
    });
  });

  it("на границе месяца и года окончание переносится на прошлый месяц и год", () => {
    const outcome = revokePermissionFrom(seedConfig, "p3", "2027-01-01");

    expect(permissionOf(outcome.config, "p3")?.endsOn).toBe("2026-12-31");
  });

  it("отзывает групповое разрешение, доступ участников группы закрывается с даты", () => {
    const outcome = revokePermissionFrom(seedConfig, "p5", "2026-11-27");

    expect(permissionOf(outcome.config, "p5")?.endsOn).toBe("2026-11-26");
    expect(accessOn(outcome.config, "boris", "mail", "2026-11-26").granted).toBe(true);
    expect(accessOn(outcome.config, "boris", "mail", "2026-11-27").granted).toBe(false);
  });

  it("отказывает, если дата отзыва совпадает с началом или раньше него", () => {
    const { config, id } = withTerm({ startsOn: "2026-11-20", endsOn: "2026-12-03" });

    for (const date of ["2026-11-20", "2026-11-10"]) {
      const outcome = revokePermissionFrom(config, id, date);

      expect(outcome.result).toBe("not-after-start");
      expect(outcome.config).toBe(config);
    }
  });

  it("отзыв со следующего после начала дня оставляет один день действия", () => {
    const { config, id } = withTerm({ startsOn: "2026-11-20", endsOn: "2026-12-03" });

    const outcome = revokePermissionFrom(config, id, "2026-11-21");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, id)).toMatchObject({ endsOn: "2026-11-20" });
  });

  it("отказывает, если разрешение и так закончится раньше даты отзыва", () => {
    const { config, id } = withTerm({ startsOn: "2026-11-20", endsOn: "2026-12-03" });

    for (const date of ["2026-12-04", "2026-12-20"]) {
      const outcome = revokePermissionFrom(config, id, date);

      expect(outcome.result).toBe("already-ended");
      expect(outcome.config).toBe(config);
    }
  });

  it("отзыв ровно со следующего после окончания дня тоже ничего не сокращает", () => {
    const { config, id } = withTerm({ endsOn: "2026-12-03" });

    expect(revokePermissionFrom(config, id, "2026-12-04").result).toBe("already-ended");
  });

  it("при одном дне действия и дате отзыва раньше него отвечает «не позже начала»", () => {
    const { config, id } = withTerm({ startsOn: "2026-11-20", endsOn: "2026-11-20" });

    expect(revokePermissionFrom(config, id, "2026-11-20").result).toBe("not-after-start");
    expect(revokePermissionFrom(config, id, "2026-11-15").result).toBe("not-after-start");
  });

  it("отказывает при пустой, неверной и несуществующей дате", () => {
    for (const date of ["", "27.11.2026", "2026-02-30", "ерунда", "2026-1-5"]) {
      const outcome = revokePermissionFrom(seedConfig, "p3", date);

      expect(outcome.result).toBe("invalid-date");
      expect(outcome.config).toBe(seedConfig);
    }
  });

  it("не меняет конфигурацию при неизвестном разрешении", () => {
    const outcome = revokePermissionFrom(seedConfig, "missing", "2026-11-27");

    expect(outcome.result).toBe("unknown-permission");
    expect(outcome.config).toBe(seedConfig);
  });

  // Требование СБ №3: отзыв меняет ровно одну запись.
  it("отзыв p3 оставляет p1, p2, p4, p5, пользователей, группы и сервисы прежними", () => {
    const before = structuredClone(seedConfig);

    const { config: next } = revokePermissionFrom(seedConfig, "p3", "2026-11-27");

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
  it("после отзыва p1 с 27.11.2026 доступ Анны остаётся через группу «Бухгалтерия»", () => {
    const { config: next } = revokePermissionFrom(seedConfig, "p1", "2026-11-27");

    const onRevokeDay = accessOn(next, "anna", "ledger", "2026-11-27");
    expect(onRevokeDay.granted).toBe(true);
    expect(onRevokeDay.sources).toEqual([
      { kind: "group", permissionId: "p2", groupId: "accounting" },
    ]);
    expect(onRevokeDay.inactive).toEqual([
      { kind: "direct", permissionId: "p1", reason: "expired", date: "2026-11-26" },
    ]);
    expect(accessOn(next, "anna", "ledger", "2026-11-26").sources).toEqual([
      { kind: "direct", permissionId: "p1" },
      { kind: "group", permissionId: "p2", groupId: "accounting" },
    ]);
  });

  it("принимает дату в прошлом", () => {
    const outcome = revokePermissionFrom(seedConfig, "p3", "2020-01-10");

    expect(outcome.result).toBe("revoked");
    expect(permissionOf(outcome.config, "p3")?.endsOn).toBe("2020-01-09");
  });
});
