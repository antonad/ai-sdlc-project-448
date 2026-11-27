import { describe, expect, it } from "vitest";
import { calculateAccess } from "../domain/access";
import type { Config } from "../domain/model";
import { CONFIG_VERSION, exportConfig, parseConfigFile } from "./config-file";
import { seedConfig } from "./seed";

const parseWith = (change: (file: Record<string, any>) => void) => {
  const file = JSON.parse(exportConfig(seedConfig));
  change(file);
  return parseConfigFile(JSON.stringify(file));
};

const errorsOf = (result: ReturnType<typeof parseConfigFile>) => (result.ok ? [] : result.errors);

describe("экспорт и импорт конфигурации", () => {
  it("пишет в файл целочисленную версию формата", () => {
    const file = JSON.parse(exportConfig(seedConfig));

    expect(file.version).toBe(CONFIG_VERSION);
    expect(Number.isInteger(file.version)).toBe(true);
  });

  it("возвращает ту же конфигурацию после экспорта и импорта", () => {
    const result = parseConfigFile(exportConfig(seedConfig));

    expect(result).toEqual({ ok: true, config: seedConfig });
  });

  it("принимает пустую конфигурацию", () => {
    const empty = { users: [], groups: [], services: [], permissions: [] };

    expect(parseConfigFile(exportConfig(empty))).toEqual({ ok: true, config: empty });
  });

  it("игнорирует неизвестные поля, чтобы файлы с будущими необязательными полями читались", () => {
    const result = parseWith((file) => {
      file.exportedBy = "later";
      file.users[0].nickname = "an";
    });

    expect(result).toEqual({ ok: true, config: seedConfig });
  });
});

describe("проверка файла импорта", () => {
  it("отвергает текст, который не разбирается как JSON", () => {
    expect(errorsOf(parseConfigFile("{oops"))).toEqual(["Файл не разбирается как JSON"]);
  });

  it("отвергает корень, который не объект", () => {
    expect(errorsOf(parseConfigFile("[]"))).toEqual(["Файл должен содержать объект конфигурации"]);
    expect(errorsOf(parseConfigFile("null"))).toEqual([
      "Файл должен содержать объект конфигурации",
    ]);
  });

  it("отвергает файл без версии", () => {
    expect(errorsOf(parseWith((file) => delete file.version))).toEqual([
      "Нет поля version с целым числом",
    ]);
  });

  it("отвергает нецелую версию", () => {
    expect(errorsOf(parseWith((file) => (file.version = "1")))).toEqual([
      "Нет поля version с целым числом",
    ]);
  });

  it("отвергает версию новее поддерживаемой", () => {
    expect(errorsOf(parseWith((file) => (file.version = CONFIG_VERSION + 1)))).toEqual([
      `Версия формата ${CONFIG_VERSION + 1} новее поддерживаемой ${CONFIG_VERSION}`,
    ]);
  });

  it("отвергает отсутствующий список", () => {
    expect(errorsOf(parseWith((file) => delete file.groups))).toEqual([
      "Поле groups должно быть списком",
    ]);
  });

  it("отвергает запись неправильной формы с указанием места", () => {
    expect(errorsOf(parseWith((file) => (file.users[1].name = 5)))).toEqual([
      "users[1]: поле name должно быть непустой строкой",
    ]);
  });

  it("отвергает повтор идентификатора", () => {
    const result = parseWith((file) => (file.services[1].id = "ledger"));

    expect(errorsOf(result)).toContain("services[1]: идентификатор «ledger» уже занят");
  });

  it("отвергает повтор идентификатора в каждом списке", () => {
    expect(errorsOf(parseWith((file) => (file.users[1].id = "anna")))).toContain(
      "users[1]: идентификатор «anna» уже занят",
    );
    expect(errorsOf(parseWith((file) => (file.groups[1].id = "accounting")))).toContain(
      "groups[1]: идентификатор «accounting» уже занят",
    );
    expect(errorsOf(parseWith((file) => (file.permissions[1].id = "p1")))).toContain(
      "permissions[1]: идентификатор «p1» уже занят",
    );
  });

  it("отвергает разрешение на несуществующего пользователя", () => {
    const result = parseWith((file) => (file.permissions[0].subject.id = "nobody"));

    expect(errorsOf(result)).toEqual(["permissions[0]: нет пользователя «nobody»"]);
  });

  it("отвергает разрешение на несуществующую группу", () => {
    const result = parseWith((file) => (file.permissions[1].subject.id = "ghosts"));

    expect(errorsOf(result)).toEqual(["permissions[1]: нет группы «ghosts»"]);
  });

  it("отвергает разрешение на несуществующий сервис", () => {
    const result = parseWith((file) => (file.permissions[2].serviceId = "vault"));

    expect(errorsOf(result)).toEqual(["permissions[2]: нет сервиса «vault»"]);
  });

  it("отвергает пользователя в несуществующей группе", () => {
    const result = parseWith((file) => file.users[0].groupIds.push("ghosts"));

    expect(errorsOf(result)).toEqual(["users[0]: нет группы «ghosts»"]);
  });

  it("отвергает неизвестный тип субъекта", () => {
    const result = parseWith((file) => (file.permissions[0].subject.type = "team"));

    expect(errorsOf(result)).toEqual(["permissions[0]: тип субъекта должен быть user или group"]);
  });

  it("отвергает запись списка, которая не объект", () => {
    expect(errorsOf(parseWith((file) => (file.users[0] = "anna")))).toEqual([
      "users[0]: запись должна быть объектом",
    ]);
  });

  it("отвергает groupIds, который не список строк", () => {
    expect(errorsOf(parseWith((file) => (file.users[0].groupIds = "accounting")))).toEqual([
      "users[0]: поле groupIds должно быть списком строк",
    ]);
    expect(errorsOf(parseWith((file) => file.users[0].groupIds.push(7)))).toEqual([
      "users[0]: поле groupIds должно быть списком строк",
    ]);
  });

  it("отвергает разрешение, у которого subject не объект", () => {
    expect(errorsOf(parseWith((file) => (file.permissions[0].subject = "anna")))).toEqual([
      "permissions[0]: поле subject должно быть объектом",
    ]);
  });

  it("ссылки проверяет только после исправления формы записей", () => {
    const result = parseWith((file) => {
      file.users[1].name = 5;
      file.permissions[0].serviceId = "vault";
    });

    expect(errorsOf(result)).toEqual(["users[1]: поле name должно быть непустой строкой"]);
  });

  it("собирает все ошибки файла, а не только первую", () => {
    const result = parseWith((file) => {
      file.permissions[0].serviceId = "vault";
      file.permissions[1].subject.id = "ghosts";
    });

    expect(errorsOf(result)).toHaveLength(2);
  });
});

const HINT_V4 = "момент в формате ГГГГ-ММ-ДДTчч:ммZ";
const HINT_V3 = "момент в формате ГГГГ-ММ-ДДTчч:мм";

describe("срок разрешения в файле версии 4 (UTC)", () => {
  const withTerms: Config = {
    ...seedConfig,
    permissions: [
      {
        ...seedConfig.permissions[0],
        startsAt: "2026-12-01T09:00Z",
        expiresAt: "2026-12-14T18:30Z",
      },
      { ...seedConfig.permissions[1], startsAt: "2026-12-01T09:00Z" },
      { ...seedConfig.permissions[2], expiresAt: "2026-12-14T18:30Z" },
      ...seedConfig.permissions.slice(3),
    ],
  };

  it("пишет в экспорт версию 4", () => {
    expect(CONFIG_VERSION).toBe(4);
    expect(JSON.parse(exportConfig(seedConfig)).version).toBe(4);
  });

  it("пишет моменты с суффиксом Z и возвращает их после круга", () => {
    const text = exportConfig(withTerms);
    const file = JSON.parse(text);
    const result = parseConfigFile(text);
    const permissions = result.ok ? result.config.permissions : [];

    expect(file.permissions[0].startsAt).toBe("2026-12-01T09:00Z");
    expect(file.permissions[0].expiresAt).toBe("2026-12-14T18:30Z");
    expect(result).toEqual({ ok: true, config: withTerms });
    expect(permissions[1]).not.toHaveProperty("expiresAt");
    expect(permissions[2]).not.toHaveProperty("startsAt");
    expect(permissions[3]).not.toHaveProperty("startsAt");
    expect(permissions[3]).not.toHaveProperty("expiresAt");
  });

  it("не пишет в файл поля срока у постоянного разрешения", () => {
    const file = JSON.parse(exportConfig(seedConfig));

    expect(file.permissions[0]).not.toHaveProperty("startsAt");
    expect(file.permissions[0]).not.toHaveProperty("expiresAt");
  });

  it("отвергает версию 5", () => {
    expect(errorsOf(parseWith((file) => (file.version = 5)))).toEqual([
      "Версия формата 5 новее поддерживаемой 4",
    ]);
  });

  it("отвергает момент без Z с указанием места", () => {
    const start = errorsOf(
      parseWith((file) => (file.permissions[0].startsAt = "2026-12-01T09:00")),
    );
    const end = errorsOf(parseWith((file) => (file.permissions[1].expiresAt = "2026-12-14T18:30")));

    expect(start).toEqual([`permissions[0].startsAt: нужен реальный ${HINT_V4}`]);
    expect(end).toEqual([`permissions[1].expiresAt: нужен реальный ${HINT_V4}`]);
  });

  it("отвергает несуществующий момент с указанием места", () => {
    const day = errorsOf(
      parseWith((file) => (file.permissions[1].expiresAt = "2026-02-30T10:00Z")),
    );
    const hour = errorsOf(
      parseWith((file) => (file.permissions[2].startsAt = "2026-03-01T25:00Z")),
    );

    expect(day).toEqual([`permissions[1].expiresAt: нужен реальный ${HINT_V4}`]);
    expect(hour).toEqual([`permissions[2].startsAt: нужен реальный ${HINT_V4}`]);
  });

  it("отвергает момент без времени, в чужом формате и не строку", () => {
    const dateOnly = errorsOf(parseWith((file) => (file.permissions[0].startsAt = "2026-03-01")));
    const dotted = errorsOf(
      parseWith((file) => (file.permissions[0].expiresAt = "01.03.2026 09:00")),
    );
    const notString = errorsOf(parseWith((file) => (file.permissions[0].startsAt = 202612010900)));
    const empty = errorsOf(parseWith((file) => (file.permissions[0].expiresAt = null)));

    expect(dateOnly).toEqual([`permissions[0].startsAt: нужен реальный ${HINT_V4}`]);
    expect(dotted).toEqual([`permissions[0].expiresAt: нужен реальный ${HINT_V4}`]);
    expect(notString[0]).toMatch(/^permissions\[0\]\.startsAt: /);
    expect(empty[0]).toMatch(/^permissions\[0\]\.expiresAt: /);
  });

  it("отвергает окончание раньше начала и равное началу", () => {
    const earlier = errorsOf(
      parseWith((file) => {
        file.permissions[3].startsAt = "2026-12-14T10:00Z";
        file.permissions[3].expiresAt = "2026-12-14T09:59Z";
      }),
    );
    const equal = errorsOf(
      parseWith((file) => {
        file.permissions[0].startsAt = "2026-12-10T12:00Z";
        file.permissions[0].expiresAt = "2026-12-10T12:00Z";
      }),
    );

    expect(earlier).toEqual(["permissions[3]: окончание должно быть позже начала"]);
    expect(equal).toEqual(["permissions[0]: окончание должно быть позже начала"]);
  });

  it("принимает окончание на минуту позже начала", () => {
    const result = parseWith((file) => {
      file.permissions[0].startsAt = "2026-12-10T12:00Z";
      file.permissions[0].expiresAt = "2026-12-10T12:01Z";
    });

    expect(result.ok).toBe(true);
  });

  it("при невалидном моменте сообщает только ошибку поля, без ошибки пары", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[3].startsAt = "2026-13-40T10:00Z";
        file.permissions[3].expiresAt = "2026-12-01T10:00Z";
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[3\]\.startsAt: /);
  });

  it("не смешивает ошибку момента и битую ссылку: ссылки проверяются после исправления формы", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[0].expiresAt = "2026-02-30T10:00Z";
        file.permissions[1].serviceId = "vault";
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[0\]\.expiresAt: /);
  });

  it("игнорирует в версии 4 старые поля дней", () => {
    const result = parseWith((file) => {
      file.permissions[0].startsOn = "2026-12-14";
      file.permissions[0].endsOn = "не день";
    });

    expect(result).toEqual({ ok: true, config: seedConfig });
  });
});

describe("файл версии 3: моменты без пояса читаются как UTC", () => {
  const v3 = (terms: Record<string, unknown>[]) =>
    JSON.stringify({
      version: 3,
      ...seedConfig,
      permissions: seedConfig.permissions.map((permission, index) => ({
        ...permission,
        ...terms[index],
      })),
    });

  const permissionsOf = (text: string) => {
    const result = parseConfigFile(text);
    return result.ok ? result.config.permissions : [];
  };

  it("добавляет Z и не сдвигает значения в поясе UTC+5", () => {
    const permissions = permissionsOf(
      v3([
        { startsAt: "2026-12-01T09:00", expiresAt: "2026-12-14T18:30" },
        { startsAt: "2026-12-01T09:00" },
        { expiresAt: "2026-12-14T18:30" },
      ]),
    );

    expect(permissions[0]).toMatchObject({
      startsAt: "2026-12-01T09:00Z",
      expiresAt: "2026-12-14T18:30Z",
    });
    expect(permissions[1]).toMatchObject({ startsAt: "2026-12-01T09:00Z" });
    expect(permissions[1]).not.toHaveProperty("expiresAt");
    expect(permissions[2]).toMatchObject({ expiresAt: "2026-12-14T18:30Z" });
    expect(permissions[2]).not.toHaveProperty("startsAt");
    expect(permissions[3]).toEqual(seedConfig.permissions[3]);
  });

  it("доступ считается по UTC, а не по местному времени", () => {
    const config: Config = {
      ...seedConfig,
      permissions: permissionsOf(v3([{ startsAt: "2026-12-01T09:00" }])).slice(0, 1),
    };
    const access = (at: Date) =>
      calculateAccess(config, { userId: "anna", serviceId: "ledger", at });

    expect(access(new Date("2026-12-01T09:00Z")).granted).toBe(true);
    expect(access(new Date("2026-12-01T08:59Z")).granted).toBe(false);
  });

  it("отвергает ошибки момента со старой подсказкой без Z", () => {
    const day = errorsOf(parseConfigFile(v3([{}, { expiresAt: "2026-02-30T10:00" }])));
    const withZone = errorsOf(parseConfigFile(v3([{ startsAt: "2026-12-01T09:00Z" }])));
    const notString = errorsOf(parseConfigFile(v3([{ expiresAt: null }])));

    expect(day).toEqual([`permissions[1].expiresAt: нужен реальный ${HINT_V3}`]);
    expect(withZone).toEqual([`permissions[0].startsAt: нужен реальный ${HINT_V3}`]);
    expect(notString[0]).toMatch(/^permissions\[0\]\.expiresAt: /);
  });

  it("отвергает окончание не позже начала", () => {
    const errors = errorsOf(
      parseConfigFile(v3([{ startsAt: "2026-12-10T12:00", expiresAt: "2026-12-10T12:00" }])),
    );

    expect(errors).toEqual(["permissions[0]: окончание должно быть позже начала"]);
  });
});

describe("файлы версий 1 и 2", () => {
  const legacy = (version: number, terms: Record<string, unknown>[]) =>
    JSON.stringify({
      version,
      ...seedConfig,
      permissions: seedConfig.permissions.map((permission, index) => ({
        ...permission,
        ...terms[index],
      })),
    });

  const permissionsOf = (text: string) => {
    const result = parseConfigFile(text);
    return result.ok ? result.config.permissions : [];
  };

  it("принимает файл версии 1 и оставляет разрешения постоянными", () => {
    const result = parseWith((file) => (file.version = 1));

    expect(result).toEqual({ ok: true, config: seedConfig });
  });

  it("переводит дни версии 1-2 в моменты UTC: начало в T00:00Z, окончание на начало следующего дня", () => {
    const permissions = permissionsOf(
      legacy(2, [
        { startsOn: "2026-12-01", endsOn: "2026-12-14" },
        { startsOn: "2026-12-01" },
        { endsOn: "2026-12-14" },
      ]),
    );

    expect(permissions[0]).toMatchObject({
      startsAt: "2026-12-01T00:00Z",
      expiresAt: "2026-12-15T00:00Z",
    });
    expect(permissions[0]).not.toHaveProperty("startsOn");
    expect(permissions[0]).not.toHaveProperty("endsOn");
    expect(permissions[1]).toMatchObject({ startsAt: "2026-12-01T00:00Z" });
    expect(permissions[1]).not.toHaveProperty("expiresAt");
    expect(permissions[2]).toMatchObject({ expiresAt: "2026-12-15T00:00Z" });
    expect(permissions[2]).not.toHaveProperty("startsAt");
    expect(permissions[3]).toEqual(seedConfig.permissions[3]);
  });

  it("переводит окончание на границе месяца, года и 29 февраля", () => {
    const permissions = permissionsOf(
      legacy(2, [{ endsOn: "2026-12-31" }, { endsOn: "2026-02-28" }, { endsOn: "2028-02-29" }]),
    );

    expect(permissions[0].expiresAt).toBe("2027-01-01T00:00Z");
    expect(permissions[1].expiresAt).toBe("2026-03-01T00:00Z");
    expect(permissions[2].expiresAt).toBe("2028-03-01T00:00Z");
  });

  it("не меняет доступ после перевода: весь 14.12.2026 по UTC доступ есть, с 2026-12-15T00:00Z нет", () => {
    const text = legacy(2, [{ startsOn: "2026-12-01", endsOn: "2026-12-14" }]);
    const parsed = parseConfigFile(text);
    const config: Config = parsed.ok ? parsed.config : seedConfig;
    const only: Config = { ...config, permissions: config.permissions.slice(0, 1) };
    const access = (at: string) =>
      calculateAccess(only, { userId: "anna", serviceId: "ledger", at: new Date(at) });

    expect(access("2026-12-14T00:00Z").granted).toBe(true);
    expect(access("2026-12-14T23:59Z").granted).toBe(true);
    expect(access("2026-12-15T00:00Z").granted).toBe(false);
    expect(access("2026-12-01T00:00Z").granted).toBe(true);
    expect(access("2026-11-30T23:59Z").granted).toBe(false);
  });

  it("читает в версии 2 только поля дней и игнорирует поля моментов", () => {
    const permissions = permissionsOf(
      legacy(2, [{ endsOn: "2026-12-14", startsAt: "ерунда", expiresAt: "2020-01-01T00:00Z" }]),
    );

    expect(permissions[0]).toMatchObject({ expiresAt: "2026-12-15T00:00Z" });
    expect(permissions[0]).not.toHaveProperty("startsAt");
  });

  it("версия 1 игнорирует поля моментов", () => {
    const permissions = permissionsOf(
      legacy(1, [{ startsAt: "ерунда", expiresAt: "2020-01-01T00:00Z" }]),
    );

    expect(permissions[0]).toEqual(seedConfig.permissions[0]);
  });

  it("отвергает несуществующий день в версиях 1 и 2 со старым текстом ошибки", () => {
    for (const version of [1, 2]) {
      expect(errorsOf(parseConfigFile(legacy(version, [{}, { endsOn: "2026-02-30" }])))).toEqual([
        "permissions[1].endsOn: нужен реальный день в формате ГГГГ-ММ-ДД",
      ]);
    }
  });

  it("отвергает день в неверном формате и не строку", () => {
    expect(errorsOf(parseConfigFile(legacy(2, [{}, {}, { startsOn: "14.12.2026" }])))).toEqual([
      "permissions[2].startsOn: нужен реальный день в формате ГГГГ-ММ-ДД",
    ]);
    expect(errorsOf(parseConfigFile(legacy(2, [{ endsOn: null }])))).toEqual([
      "permissions[0].endsOn: нужен реальный день в формате ГГГГ-ММ-ДД",
    ]);
  });

  it("отвергает дни версии 2, где окончание раньше начала", () => {
    const errors = errorsOf(
      parseConfigFile(legacy(2, [{}, {}, {}, { startsOn: "2026-12-14", endsOn: "2026-12-01" }])),
    );

    expect(errors).toEqual(["permissions[3]: окончание должно быть позже начала"]);
  });

  it("принимает один и тот же день в начале и окончании версии 2: срок на сутки", () => {
    const permissions = permissionsOf(
      legacy(2, [{ startsOn: "2026-12-10", endsOn: "2026-12-10" }]),
    );

    expect(permissions[0]).toMatchObject({
      startsAt: "2026-12-10T00:00Z",
      expiresAt: "2026-12-11T00:00Z",
    });
  });
});

describe("отзыв разрешения в файле версии 4", () => {
  const withRevoke: Config = {
    ...seedConfig,
    permissions: [
      { ...seedConfig.permissions[0], revokedAt: "2026-12-10T12:00Z" },
      {
        ...seedConfig.permissions[1],
        startsAt: "2026-12-01T09:00Z",
        expiresAt: "2026-12-14T18:30Z",
        revokedAt: "2026-12-10T12:00Z",
      },
      ...seedConfig.permissions.slice(2),
    ],
  };

  it("возвращает отзыв после круга экспорта и импорта, версия 4", () => {
    const text = exportConfig(withRevoke);
    const result = parseConfigFile(text);

    expect(JSON.parse(text).version).toBe(4);
    expect(JSON.parse(text).permissions[0].revokedAt).toBe("2026-12-10T12:00Z");
    expect(result).toEqual({ ok: true, config: withRevoke });
    expect(JSON.parse(text).permissions[2]).not.toHaveProperty("revokedAt");
  });

  it("читает файл версии 4 без revokedAt", () => {
    const result = parseWith((file) => {
      file.permissions[0].startsAt = "2026-12-01T09:00Z";
    });

    expect(result.ok).toBe(true);
    const permissions = result.ok ? result.config.permissions : [];
    expect(permissions[0]).not.toHaveProperty("revokedAt");
  });

  it("читает отзыв версии 3 как UTC", () => {
    const result = parseWith((file) => {
      file.version = 3;
      file.permissions[0].revokedAt = "2026-12-10T12:00";
    });
    const permissions = result.ok ? result.config.permissions : [];

    expect(permissions[0].revokedAt).toBe("2026-12-10T12:00Z");
  });

  it("отвергает неверный момент отзыва с указанием места", () => {
    const day = errorsOf(
      parseWith((file) => (file.permissions[1].revokedAt = "2026-02-30T10:00Z")),
    );
    const noZone = errorsOf(
      parseWith((file) => (file.permissions[0].revokedAt = "2026-12-10T12:00")),
    );
    const wrongFormat = errorsOf(
      parseWith((file) => (file.permissions[0].revokedAt = "10.12.2026 12:00")),
    );
    const notString = errorsOf(parseWith((file) => (file.permissions[2].revokedAt = null)));

    expect(day).toEqual([`permissions[1].revokedAt: нужен реальный ${HINT_V4}`]);
    expect(noZone).toEqual([`permissions[0].revokedAt: нужен реальный ${HINT_V4}`]);
    expect(wrongFormat).toEqual([`permissions[0].revokedAt: нужен реальный ${HINT_V4}`]);
    expect(notString[0]).toMatch(/^permissions\[2\]\.revokedAt: /);
  });

  it("отвергает отзыв не позже начала, равный и ранний", () => {
    const equal = errorsOf(
      parseWith((file) => {
        file.permissions[0].startsAt = "2026-12-10T12:00Z";
        file.permissions[0].revokedAt = "2026-12-10T12:00Z";
      }),
    );
    const earlier = errorsOf(
      parseWith((file) => {
        file.permissions[0].startsAt = "2026-12-10T12:00Z";
        file.permissions[0].revokedAt = "2026-12-10T11:59Z";
      }),
    );

    expect(equal).toEqual(["permissions[0]: отзыв должен быть позже начала"]);
    expect(earlier).toEqual(["permissions[0]: отзыв должен быть позже начала"]);
  });

  it("отвергает отзыв не раньше окончания, равный и поздний", () => {
    const equal = errorsOf(
      parseWith((file) => {
        file.permissions[1].expiresAt = "2026-12-14T18:00Z";
        file.permissions[1].revokedAt = "2026-12-14T18:00Z";
      }),
    );
    const later = errorsOf(
      parseWith((file) => {
        file.permissions[1].expiresAt = "2026-12-14T18:00Z";
        file.permissions[1].revokedAt = "2026-12-14T18:01Z";
      }),
    );

    expect(equal).toEqual(["permissions[1]: отзыв должен быть раньше окончания"]);
    expect(later).toEqual(["permissions[1]: отзыв должен быть раньше окончания"]);
  });

  it("принимает отзыв на минуту позже начала и на минуту раньше окончания", () => {
    const result = parseWith((file) => {
      file.permissions[0].startsAt = "2026-12-10T12:00Z";
      file.permissions[0].expiresAt = "2026-12-10T12:02Z";
      file.permissions[0].revokedAt = "2026-12-10T12:01Z";
    });

    expect(result.ok).toBe(true);
  });

  it("при неверном моменте отзыва не добавляет ошибку границ", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[0].startsAt = "2026-12-10T12:00Z";
        file.permissions[0].revokedAt = "2026-13-40T10:00Z";
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[0\]\.revokedAt: /);
  });

  it("версия 2 игнорирует revokedAt, даже неверный", () => {
    const text = JSON.stringify({
      version: 2,
      ...seedConfig,
      permissions: seedConfig.permissions.map((permission, index) =>
        index === 0 ? { ...permission, revokedAt: "ерунда" } : permission,
      ),
    });

    expect(parseConfigFile(text)).toEqual({ ok: true, config: seedConfig });
  });

  it("версия 1 игнорирует revokedAt", () => {
    const result = parseWith((file) => {
      file.version = 1;
      file.permissions[0].revokedAt = "2026-12-10T12:00Z";
    });

    expect(result).toEqual({ ok: true, config: seedConfig });
  });
});
