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

// Срок разрешения хранится в UTC (`...Z`), момент расчёта собирается как UTC-мгновение: пояс не влияет.
const moment = (year: number, month: number, date: number, hours = 12, minutes = 0, seconds = 0) =>
  new Date(Date.UTC(year, month - 1, date, hours, minutes, seconds));

const withPermissions = (permissions: Config["permissions"]): Config => ({
  ...config,
  permissions,
});

const contractor = (startsAt?: string, expiresAt?: string): Config =>
  withPermissions([
    {
      id: "t1",
      subject: { type: "user", id: "vera" },
      serviceId: "mail",
      ...(startsAt === undefined ? {} : { startsAt }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    },
  ]);

const check = (cfg: Config, at: Date, userId = "vera") =>
  calculateAccess(cfg, { userId, serviceId: "mail", at });

describe("calculateAccess: срок действия разрешения", () => {
  const cfg = contractor("2026-12-01T09:00Z", "2026-12-14T18:00Z");

  it("даёт доступ ровно в момент начала", () => {
    const result = check(cfg, moment(2026, 12, 1, 9, 0));

    expect(result).toEqual({
      granted: true,
      sources: [{ kind: "direct", permissionId: "t1" }],
      inactive: [],
    });
  });

  it("не даёт доступ за минуту до начала и называет причину с моментом", () => {
    const result = check(cfg, moment(2026, 12, 1, 8, 59));

    expect(result.granted).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "t1", reason: "not-started", boundary: "2026-12-01T09:00Z" },
    ]);
  });

  it("даёт доступ внутри интервала", () => {
    expect(check(cfg, moment(2026, 12, 7, 13, 30)).granted).toBe(true);
  });

  it("даёт доступ за минуту до окончания", () => {
    expect(check(cfg, moment(2026, 12, 14, 17, 59)).granted).toBe(true);
  });

  it("не даёт доступ ровно в момент окончания и называет причину с моментом", () => {
    const result = check(cfg, moment(2026, 12, 14, 18, 0));

    expect(result.granted).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "t1", reason: "expired", boundary: "2026-12-14T18:00Z" },
    ]);
  });

  it("не даёт доступ после окончания", () => {
    expect(check(cfg, moment(2026, 12, 15, 0, 0)).granted).toBe(false);
  });

  it("не учитывает секунды: 17:59:59 ещё в сроке, 18:00:30 уже нет", () => {
    expect(check(cfg, moment(2026, 12, 14, 17, 59, 59)).granted).toBe(true);
    expect(check(cfg, moment(2026, 12, 14, 18, 0, 30)).granted).toBe(false);
  });

  it("не учитывает секунды у начала: 09:00:00 в сроке, 08:59:59 нет", () => {
    expect(check(cfg, moment(2026, 12, 1, 9, 0, 0)).granted).toBe(true);
    expect(check(cfg, moment(2026, 12, 1, 8, 59, 59)).granted).toBe(false);
  });

  it("с одним только началом действует с него и дальше", () => {
    const open = contractor("2026-12-01T09:00Z");

    expect(check(open, moment(2026, 12, 1, 8, 59)).granted).toBe(false);
    expect(check(open, moment(2026, 12, 1, 9, 0)).granted).toBe(true);
    expect(check(open, moment(2040, 1, 1)).granted).toBe(true);
  });

  it("с одним только окончанием действует до него, само окончание уже не входит", () => {
    const open = contractor(undefined, "2026-12-14T18:00Z");

    expect(check(open, moment(2020, 1, 1)).granted).toBe(true);
    expect(check(open, moment(2026, 12, 14, 17, 59)).granted).toBe(true);
    expect(check(open, moment(2026, 12, 14, 18, 0)).granted).toBe(false);
  });

  it("постоянное разрешение даёт доступ на любой момент и не попадает в недействующие", () => {
    const permanent = contractor();

    expect(check(permanent, moment(2000, 1, 1))).toEqual({
      granted: true,
      sources: [{ kind: "direct", permissionId: "t1" }],
      inactive: [],
    });
    expect(check(permanent, moment(2099, 12, 31, 23, 59)).granted).toBe(true);
  });

  it("разрешение группы с интервалом действует для участника только в нём", () => {
    const groupCfg = withPermissions([
      {
        id: "g1",
        subject: { type: "group", id: "support" },
        serviceId: "mail",
        startsAt: "2026-12-01T09:00Z",
        expiresAt: "2026-12-14T18:00Z",
      },
    ]);

    expect(check(groupCfg, moment(2026, 12, 1, 9, 0), "boris").sources).toEqual([
      { kind: "group", permissionId: "g1", groupId: "support" },
    ]);
    expect(check(groupCfg, moment(2026, 12, 14, 17, 59), "boris").granted).toBe(true);
    expect(check(groupCfg, moment(2026, 12, 14, 18, 0), "boris").granted).toBe(false);
    expect(check(groupCfg, moment(2026, 12, 1, 8, 59), "boris").granted).toBe(false);
  });

  it("постоянное и временное разрешения дают независимые источники", () => {
    const mixed = withPermissions([
      {
        id: "d1",
        subject: { type: "user", id: "boris" },
        serviceId: "mail",
        expiresAt: "2026-12-14T18:00Z",
      },
      { id: "g1", subject: { type: "group", id: "support" }, serviceId: "mail" },
    ]);

    const inside = check(mixed, moment(2026, 12, 14, 10, 0), "boris");

    expect(inside.granted).toBe(true);
    expect(inside.sources).toEqual([
      { kind: "direct", permissionId: "d1" },
      { kind: "group", permissionId: "g1", groupId: "support" },
    ]);
    expect(inside.inactive).toEqual([]);

    const after = check(mixed, moment(2026, 12, 14, 18, 0), "boris");

    expect(after.granted).toBe(true);
    expect(after.sources).toEqual([{ kind: "group", permissionId: "g1", groupId: "support" }]);
    expect(after.inactive).toEqual([
      { kind: "direct", permissionId: "d1", reason: "expired", boundary: "2026-12-14T18:00Z" },
    ]);
  });

  it("перечисляет недействующие: прямые первыми, групповые в порядке разрешений", () => {
    const many = withPermissions([
      {
        id: "g1",
        subject: { type: "group", id: "support" },
        serviceId: "mail",
        startsAt: "2027-01-01T08:00Z",
      },
      {
        id: "d1",
        subject: { type: "user", id: "anna" },
        serviceId: "mail",
        expiresAt: "2026-01-01T10:30Z",
      },
      {
        id: "g2",
        subject: { type: "group", id: "accounting" },
        serviceId: "mail",
        expiresAt: "2026-02-01T00:00Z",
      },
    ]);

    const result = check(many, moment(2026, 12, 20), "anna");

    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "d1", reason: "expired", boundary: "2026-01-01T10:30Z" },
      {
        kind: "group",
        permissionId: "g1",
        groupId: "support",
        reason: "not-started",
        boundary: "2027-01-01T08:00Z",
      },
      {
        kind: "group",
        permissionId: "g2",
        groupId: "accounting",
        reason: "expired",
        boundary: "2026-02-01T00:00Z",
      },
    ]);
  });

  it("не показывает чужие недействующие разрешения", () => {
    const foreign = withPermissions([
      {
        id: "x1",
        subject: { type: "user", id: "boris" },
        serviceId: "mail",
        expiresAt: "2026-01-01T00:00Z",
      },
      {
        id: "x2",
        subject: { type: "group", id: "accounting" },
        serviceId: "mail",
        expiresAt: "2026-01-01T00:00Z",
      },
      {
        id: "x3",
        subject: { type: "user", id: "vera" },
        serviceId: "ledger",
        expiresAt: "2026-01-01T00:00Z",
      },
    ]);

    expect(check(foreign, moment(2026, 12, 20), "vera")).toEqual({
      granted: false,
      sources: [],
      inactive: [],
    });
  });
});

describe("calculateAccess: отзыв разрешения", () => {
  const revocable = (terms: { startsAt?: string; expiresAt?: string; revokedAt?: string }) =>
    withPermissions([
      { id: "r1", subject: { type: "user", id: "vera" }, serviceId: "mail", ...terms },
    ]);

  it("даёт доступ за минуту до отзыва", () => {
    const result = check(
      revocable({ revokedAt: "2026-12-10T12:00Z" }),
      moment(2026, 12, 10, 11, 59),
    );

    expect(result).toEqual({
      granted: true,
      sources: [{ kind: "direct", permissionId: "r1" }],
      inactive: [],
    });
  });

  it("не даёт доступ ровно с момента отзыва и называет причину с границей", () => {
    const result = check(
      revocable({ revokedAt: "2026-12-10T12:00Z" }),
      moment(2026, 12, 10, 12, 0),
    );

    expect(result.granted).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "r1", reason: "revoked", boundary: "2026-12-10T12:00Z" },
    ]);
  });

  it("не даёт доступ и после отзыва", () => {
    expect(check(revocable({ revokedAt: "2026-12-10T12:00Z" }), moment(2030, 1, 1)).granted).toBe(
      false,
    );
  });

  it("отзыв раньше окончания: после отзыва причина revoked", () => {
    const cfg = revocable({ revokedAt: "2026-12-10T12:00Z", expiresAt: "2026-12-14T18:00Z" });

    expect(check(cfg, moment(2026, 12, 10, 12, 0)).inactive).toEqual([
      { kind: "direct", permissionId: "r1", reason: "revoked", boundary: "2026-12-10T12:00Z" },
    ]);
    expect(check(cfg, moment(2026, 12, 14, 18, 0)).inactive).toEqual([
      { kind: "direct", permissionId: "r1", reason: "revoked", boundary: "2026-12-10T12:00Z" },
    ]);
  });

  it("окончание раньше отзыва: после окончания причина expired", () => {
    const cfg = revocable({ revokedAt: "2026-12-20T12:00Z", expiresAt: "2026-12-14T18:00Z" });

    expect(check(cfg, moment(2026, 12, 14, 18, 0)).inactive).toEqual([
      { kind: "direct", permissionId: "r1", reason: "expired", boundary: "2026-12-14T18:00Z" },
    ]);
    expect(check(cfg, moment(2026, 12, 20, 12, 0)).inactive).toEqual([
      { kind: "direct", permissionId: "r1", reason: "expired", boundary: "2026-12-14T18:00Z" },
    ]);
  });

  it("до начала причина not-started, даже если момент отзыва уже прошёл", () => {
    const cfg = revocable({ startsAt: "2026-12-20T09:00Z", revokedAt: "2026-12-10T12:00Z" });

    expect(check(cfg, moment(2026, 12, 15)).inactive).toEqual([
      { kind: "direct", permissionId: "r1", reason: "not-started", boundary: "2026-12-20T09:00Z" },
    ]);
  });

  it("отзыв не отключает другой источник: второе прямое временное разрешение действует", () => {
    const cfg = withPermissions([
      {
        id: "r1",
        subject: { type: "user", id: "vera" },
        serviceId: "mail",
        revokedAt: "2026-12-10T12:00Z",
      },
      {
        id: "r2",
        subject: { type: "user", id: "vera" },
        serviceId: "mail",
        expiresAt: "2026-12-31T00:00Z",
      },
    ]);

    const result = check(cfg, moment(2026, 12, 11));

    expect(result.granted).toBe(true);
    expect(result.sources).toEqual([{ kind: "direct", permissionId: "r2" }]);
    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "r1", reason: "revoked", boundary: "2026-12-10T12:00Z" },
    ]);
  });

  it("отзыв прямого разрешения не трогает доступ по группе", () => {
    const cfg = withPermissions([
      {
        id: "d1",
        subject: { type: "user", id: "boris" },
        serviceId: "mail",
        revokedAt: "2026-12-10T12:00Z",
      },
      { id: "g1", subject: { type: "group", id: "support" }, serviceId: "mail" },
    ]);

    const result = check(cfg, moment(2026, 12, 11), "boris");

    expect(result.granted).toBe(true);
    expect(result.sources).toEqual([{ kind: "group", permissionId: "g1", groupId: "support" }]);
    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "d1", reason: "revoked", boundary: "2026-12-10T12:00Z" },
    ]);
  });

  it("отозванное групповое разрешение не действует для участника", () => {
    const cfg = withPermissions([
      {
        id: "g1",
        subject: { type: "group", id: "support" },
        serviceId: "mail",
        revokedAt: "2026-12-10T12:00Z",
      },
    ]);

    expect(check(cfg, moment(2026, 12, 10, 11, 59), "boris").granted).toBe(true);

    const after = check(cfg, moment(2026, 12, 10, 12, 0), "boris");

    expect(after.granted).toBe(false);
    expect(after.inactive).toEqual([
      {
        kind: "group",
        permissionId: "g1",
        groupId: "support",
        reason: "revoked",
        boundary: "2026-12-10T12:00Z",
      },
    ]);
  });

  it("без revokedAt поведение прежнее", () => {
    const cfg = revocable({ expiresAt: "2026-12-14T18:00Z" });

    expect(check(cfg, moment(2026, 12, 14, 17, 59)).granted).toBe(true);
    expect(check(cfg, moment(2026, 12, 14, 18, 0)).inactive).toEqual([
      { kind: "direct", permissionId: "r1", reason: "expired", boundary: "2026-12-14T18:00Z" },
    ]);
  });

  it("не учитывает секунды у отзыва: 11:59:59 доступ есть, 12:00:00 нет", () => {
    const cfg = revocable({ revokedAt: "2026-12-10T12:00Z" });

    expect(check(cfg, moment(2026, 12, 10, 11, 59, 59)).granted).toBe(true);
    expect(check(cfg, moment(2026, 12, 10, 12, 0, 0)).granted).toBe(false);
  });
});

describe("calculateAccess: пояс не влияет на результат", () => {
  const cfg = contractor("2026-12-01T09:00Z", "2026-12-01T18:00Z");

  it("одно и то же мгновение, заданное разными способами, даёт один результат", () => {
    const viaIso = check(cfg, new Date("2026-12-01T09:00Z"));
    const viaUtc = check(cfg, new Date(Date.UTC(2026, 11, 1, 9, 0)));
    const viaMillis = check(cfg, new Date(Date.parse("2026-12-01T14:00:00+05:00")));

    expect(viaIso.granted).toBe(true);
    expect(viaUtc).toEqual(viaIso);
    expect(viaMillis).toEqual(viaIso);
  });

  it("границы сравниваются по UTC, а не по локальному поясу процесса", () => {
    expect(check(cfg, new Date("2026-12-01T08:59Z")).granted).toBe(false);
    expect(check(cfg, new Date("2026-12-01T09:00Z")).granted).toBe(true);
    expect(check(cfg, new Date("2026-12-01T17:59Z")).granted).toBe(true);
    expect(check(cfg, new Date("2026-12-01T18:00Z")).granted).toBe(false);
  });

  it("локальные часы процесса (UTC+5) не сдвигают границу: локальные 09:00 это 04:00Z, срок ещё не начался", () => {
    const result = check(cfg, new Date(2026, 11, 1, 9, 0));

    expect(result.granted).toBe(false);
    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "t1", reason: "not-started", boundary: "2026-12-01T09:00Z" },
    ]);
  });

  it("граница в причине остаётся в UTC с Z", () => {
    const result = check(cfg, new Date("2026-12-01T18:00Z"));

    expect(result.inactive).toEqual([
      { kind: "direct", permissionId: "t1", reason: "expired", boundary: "2026-12-01T18:00Z" },
    ]);
  });
});
