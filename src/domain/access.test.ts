import { describe, expect, it } from "vitest";
import { calculateAccess } from "./access";
import type { Config } from "./model";

const config: Config = {
  users: [
    { id: "anna", name: "Анна Белова", groupIds: ["accounting", "support"] },
    { id: "boris", name: "Борис Каримов", groupIds: ["support"] },
    { id: "vera", name: "Вера Лисицына", groupIds: [] },
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
    { id: "p1", subject: { type: "user", id: "boris" }, serviceId: "ledger" },
    { id: "p2", subject: { type: "group", id: "accounting" }, serviceId: "ledger" },
    { id: "p3", subject: { type: "group", id: "support" }, serviceId: "mail" },
    { id: "p4", subject: { type: "user", id: "anna" }, serviceId: "mail" },
  ],
};

const at = new Date("2026-10-06T12:00:00Z");

describe("calculateAccess", () => {
  it("даёт доступ по прямому разрешению", () => {
    const result = calculateAccess(config, { userId: "boris", serviceId: "ledger", at });

    expect(result.granted).toBe(true);
    expect(result.sources).toEqual([{ kind: "direct", permissionId: "p1" }]);
  });

  it("даёт доступ по разрешению группы", () => {
    const result = calculateAccess(config, { userId: "boris", serviceId: "mail", at });

    expect(result.granted).toBe(true);
    expect(result.sources).toEqual([{ kind: "group", permissionId: "p3", groupId: "support" }]);
  });

  it("называет прямой и групповой источники вместе", () => {
    const result = calculateAccess(config, { userId: "anna", serviceId: "mail", at });

    expect(result.granted).toBe(true);
    expect(result.sources).toEqual([
      { kind: "direct", permissionId: "p4" },
      { kind: "group", permissionId: "p3", groupId: "support" },
    ]);
  });

  it("называет источники нескольких групп", () => {
    const result = calculateAccess(config, { userId: "anna", serviceId: "ledger", at });

    expect(result.sources).toEqual([{ kind: "group", permissionId: "p2", groupId: "accounting" }]);
  });

  it("не даёт доступ без разрешений", () => {
    const result = calculateAccess(config, { userId: "vera", serviceId: "ledger", at });

    expect(result).toEqual({ granted: false, sources: [], inactive: [] });
  });

  it("не берёт разрешения чужих групп и других сервисов", () => {
    const result = calculateAccess(config, { userId: "boris", serviceId: "unknown", at });

    expect(result.granted).toBe(false);
  });

  it("перечисляет групповые источники в порядке разрешений, а не групп сотрудника", () => {
    const ordered: Config = {
      ...config,
      permissions: [
        { id: "q1", subject: { type: "group", id: "support" }, serviceId: "ledger" },
        { id: "q2", subject: { type: "group", id: "accounting" }, serviceId: "ledger" },
      ],
    };

    const result = calculateAccess(ordered, { userId: "anna", serviceId: "ledger", at });

    expect(result.sources).toEqual([
      { kind: "group", permissionId: "q1", groupId: "support" },
      { kind: "group", permissionId: "q2", groupId: "accounting" },
    ]);
  });

  it("делает отдельный источник из каждого подходящего разрешения без склейки", () => {
    const repeated: Config = {
      ...config,
      permissions: [
        { id: "q1", subject: { type: "user", id: "vera" }, serviceId: "mail" },
        { id: "q2", subject: { type: "user", id: "vera" }, serviceId: "mail" },
      ],
    };

    const result = calculateAccess(repeated, { userId: "vera", serviceId: "mail", at });

    expect(result.sources).toEqual([
      { kind: "direct", permissionId: "q1" },
      { kind: "direct", permissionId: "q2" },
    ]);
  });

  it("для неизвестного сервиса возвращает пустой список источников", () => {
    const result = calculateAccess(config, { userId: "anna", serviceId: "unknown", at });

    expect(result).toEqual({ granted: false, sources: [], inactive: [] });
  });

  it("не даёт доступ несуществующему сотруднику, даже если есть разрешения группам", () => {
    const result = calculateAccess(config, { userId: "ghost", serviceId: "mail", at });

    expect(result).toEqual({ granted: false, sources: [], inactive: [] });
  });

  it("не проверяет наличие сотрудника в списке: прямое разрешение с его id даёт доступ", () => {
    const orphan: Config = {
      ...config,
      permissions: [{ id: "q1", subject: { type: "user", id: "ghost" }, serviceId: "mail" }],
    };

    const result = calculateAccess(orphan, { userId: "ghost", serviceId: "mail", at });

    expect(result).toEqual({
      granted: true,
      sources: [{ kind: "direct", permissionId: "q1" }],
      inactive: [],
    });
  });

  it("принимает момент расчёта параметром и даёт тот же ответ в любое время", () => {
    const early = calculateAccess(config, {
      userId: "boris",
      serviceId: "ledger",
      at: new Date("2020-01-01T00:00:00Z"),
    });
    const late = calculateAccess(config, {
      userId: "boris",
      serviceId: "ledger",
      at: new Date("2040-01-01T00:00:00Z"),
    });

    expect(early).toEqual(late);
  });
});

// Момент расчёта собирается локальным конструктором: тесты не зависят от часового пояса машины.
const day = (year: number, month: number, date: number, hours = 12, minutes = 0) =>
  new Date(year, month - 1, date, hours, minutes);

const withPermissions = (permissions: Config["permissions"]): Config => ({
  ...config,
  permissions,
});

const contractor = (startsOn?: string, endsOn?: string): Config =>
  withPermissions([
    {
      id: "t1",
      subject: { type: "user", id: "vera" },
      serviceId: "mail",
      ...(startsOn === undefined ? {} : { startsOn }),
      ...(endsOn === undefined ? {} : { endsOn }),
    },
  ]);

const check = (cfg: Config, at: Date, userId = "vera") =>
  calculateAccess(cfg, { userId, serviceId: "mail", at });

describe("calculateAccess: срок действия разрешения", () => {
  const cfg = contractor("2026-12-01", "2026-12-14");

  it("даёт доступ в первый день договора", () => {
    const result = check(cfg, day(2026, 12, 1, 0, 0));

    expect(result).toEqual({
      granted: true,
      sources: [{ kind: "direct", permissionId: "t1" }],
      inactive: [],
    });
  });

  it("даёт доступ в последний день договора", () => {
    expect(check(cfg, day(2026, 12, 14)).granted).toBe(true);
  });

  it("не считает время суток: 23:59 последнего дня ещё в сроке", () => {
    expect(check(cfg, day(2026, 12, 14, 23, 59)).granted).toBe(true);
  });

  it("не даёт доступ в день после окончания и называет причину с датой", () => {
    const result = check(cfg, day(2026, 12, 15, 0, 0));

    expect(result.granted).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "t1", reason: "expired", date: "2026-12-14" },
    ]);
  });

  it("не даёт доступ в день до начала и называет причину с датой", () => {
    const result = check(cfg, day(2026, 11, 30, 23, 59));

    expect(result.granted).toBe(false);
    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "t1", reason: "not-started", date: "2026-12-01" },
    ]);
  });

  it("интервал в один день действует только в этот день", () => {
    const oneDay = contractor("2026-12-10", "2026-12-10");

    expect(check(oneDay, day(2026, 12, 9)).granted).toBe(false);
    expect(check(oneDay, day(2026, 12, 10)).granted).toBe(true);
    expect(check(oneDay, day(2026, 12, 11)).granted).toBe(false);
  });

  it("с одним только началом действует с него и дальше", () => {
    const open = contractor("2026-12-01");

    expect(check(open, day(2026, 11, 30)).granted).toBe(false);
    expect(check(open, day(2026, 12, 1)).granted).toBe(true);
    expect(check(open, day(2040, 1, 1)).granted).toBe(true);
  });

  it("с одним только окончанием действует до него включительно", () => {
    const open = contractor(undefined, "2026-12-14");

    expect(check(open, day(2020, 1, 1)).granted).toBe(true);
    expect(check(open, day(2026, 12, 14)).granted).toBe(true);
    expect(check(open, day(2026, 12, 15)).granted).toBe(false);
  });

  it("постоянное разрешение даёт доступ на любую дату и не попадает в недействующие", () => {
    const permanent = contractor();

    expect(check(permanent, day(2000, 1, 1))).toEqual({
      granted: true,
      sources: [{ kind: "direct", permissionId: "t1" }],
      inactive: [],
    });
    expect(check(permanent, day(2099, 12, 31)).granted).toBe(true);
  });

  it("разрешение группы со сроком действует для участника только в эти дни", () => {
    const groupCfg = withPermissions([
      {
        id: "g1",
        subject: { type: "group", id: "support" },
        serviceId: "mail",
        startsOn: "2026-12-01",
        endsOn: "2026-12-14",
      },
    ]);

    expect(check(groupCfg, day(2026, 12, 1), "boris").sources).toEqual([
      { kind: "group", permissionId: "g1", groupId: "support" },
    ]);
    expect(check(groupCfg, day(2026, 12, 14), "boris").granted).toBe(true);
    expect(check(groupCfg, day(2026, 12, 15), "boris").granted).toBe(false);
    expect(check(groupCfg, day(2026, 11, 30), "boris").granted).toBe(false);
  });

  it("сохраняет независимый источник, когда прямое разрешение истекло", () => {
    const mixed = withPermissions([
      {
        id: "d1",
        subject: { type: "user", id: "boris" },
        serviceId: "mail",
        endsOn: "2026-12-14",
      },
      { id: "g1", subject: { type: "group", id: "support" }, serviceId: "mail" },
    ]);

    const result = check(mixed, day(2026, 12, 20), "boris");

    expect(result.granted).toBe(true);
    expect(result.sources).toEqual([{ kind: "group", permissionId: "g1", groupId: "support" }]);
    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "d1", reason: "expired", date: "2026-12-14" },
    ]);
  });

  it("перечисляет недействующие: прямые первыми, групповые в порядке разрешений", () => {
    const many = withPermissions([
      {
        id: "g1",
        subject: { type: "group", id: "support" },
        serviceId: "mail",
        startsOn: "2027-01-01",
      },
      {
        id: "d1",
        subject: { type: "user", id: "anna" },
        serviceId: "mail",
        endsOn: "2026-01-01",
      },
      {
        id: "g2",
        subject: { type: "group", id: "accounting" },
        serviceId: "mail",
        endsOn: "2026-02-01",
      },
    ]);

    const result = check(many, day(2026, 12, 20), "anna");

    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "d1", reason: "expired", date: "2026-01-01" },
      {
        kind: "group",
        permissionId: "g1",
        groupId: "support",
        reason: "not-started",
        date: "2027-01-01",
      },
      {
        kind: "group",
        permissionId: "g2",
        groupId: "accounting",
        reason: "expired",
        date: "2026-02-01",
      },
    ]);
  });

  it("не показывает чужие недействующие разрешения", () => {
    const foreign = withPermissions([
      {
        id: "x1",
        subject: { type: "user", id: "boris" },
        serviceId: "mail",
        endsOn: "2026-01-01",
      },
      {
        id: "x2",
        subject: { type: "group", id: "accounting" },
        serviceId: "mail",
        endsOn: "2026-01-01",
      },
      {
        id: "x3",
        subject: { type: "user", id: "vera" },
        serviceId: "ledger",
        endsOn: "2026-01-01",
      },
    ]);

    expect(check(foreign, day(2026, 12, 20), "vera")).toEqual({
      granted: false,
      sources: [],
      inactive: [],
    });
  });
});
