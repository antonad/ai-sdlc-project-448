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

describe("срок разрешения в файле версии 3", () => {
  const withTerms: Config = {
    ...seedConfig,
    permissions: [
      {
        ...seedConfig.permissions[0],
        startsAt: "2026-12-01T09:00",
        expiresAt: "2026-12-14T18:30",
      },
      { ...seedConfig.permissions[1], startsAt: "2026-12-01T09:00" },
      { ...seedConfig.permissions[2], expiresAt: "2026-12-14T18:30" },
      ...seedConfig.permissions.slice(3),
    ],
  };

  it("пишет в экспорт версию 3", () => {
    expect(CONFIG_VERSION).toBe(3);
    expect(JSON.parse(exportConfig(seedConfig)).version).toBe(3);
  });

  it("возвращает постоянное, интервальное и одностороннее разрешения после круга", () => {
    const result = parseConfigFile(exportConfig(withTerms));
    const permissions = result.ok ? result.config.permissions : [];

    expect(result).toEqual({ ok: true, config: withTerms });
    expect(permissions[0]).toMatchObject({
      startsAt: "2026-12-01T09:00",
      expiresAt: "2026-12-14T18:30",
    });
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

  it("отвергает версию 4", () => {
    expect(errorsOf(parseWith((file) => (file.version = 4)))).toEqual([
      "Версия формата 4 новее поддерживаемой 3",
    ]);
  });

  it("отвергает несуществующий момент с указанием места", () => {
    const day = errorsOf(parseWith((file) => (file.permissions[1].expiresAt = "2026-02-30T10:00")));
    const hour = errorsOf(parseWith((file) => (file.permissions[2].startsAt = "2026-03-01T25:00")));

    expect(day).toEqual([
      "permissions[1].expiresAt: нужен реальный момент в формате ГГГГ-ММ-ДДTчч:мм",
    ]);
    expect(hour).toEqual([
      "permissions[2].startsAt: нужен реальный момент в формате ГГГГ-ММ-ДДTчч:мм",
    ]);
  });

  it("отвергает момент без времени и в чужом формате", () => {
    const dateOnly = errorsOf(parseWith((file) => (file.permissions[0].startsAt = "2026-03-01")));
    const dotted = errorsOf(
      parseWith((file) => (file.permissions[0].expiresAt = "01.03.2026 09:00")),
    );

    expect(dateOnly).toEqual([
      "permissions[0].startsAt: нужен реальный момент в формате ГГГГ-ММ-ДДTчч:мм",
    ]);
    expect(dotted).toEqual([
      "permissions[0].expiresAt: нужен реальный момент в формате ГГГГ-ММ-ДДTчч:мм",
    ]);
  });

  it("отвергает значение не строкой", () => {
    const start = errorsOf(parseWith((file) => (file.permissions[0].startsAt = 202612010900)));
    const end = errorsOf(parseWith((file) => (file.permissions[0].expiresAt = null)));

    expect(start[0]).toMatch(/^permissions\[0\]\.startsAt: /);
    expect(end[0]).toMatch(/^permissions\[0\]\.expiresAt: /);
  });

  it("отвергает окончание раньше начала с указанием разрешения", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[3].startsAt = "2026-12-14T10:00";
        file.permissions[3].expiresAt = "2026-12-14T09:59";
      }),
    );

    expect(errors).toEqual(["permissions[3]: окончание должно быть позже начала"]);
  });

  it("отвергает окончание, равное началу", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[0].startsAt = "2026-12-10T12:00";
        file.permissions[0].expiresAt = "2026-12-10T12:00";
      }),
    );

    expect(errors).toEqual(["permissions[0]: окончание должно быть позже начала"]);
  });

  it("принимает окончание на минуту позже начала", () => {
    const result = parseWith((file) => {
      file.permissions[0].startsAt = "2026-12-10T12:00";
      file.permissions[0].expiresAt = "2026-12-10T12:01";
    });

    expect(result.ok).toBe(true);
  });

  it("при невалидном моменте сообщает только ошибку поля, без ошибки пары", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[3].startsAt = "2026-13-40T10:00";
        file.permissions[3].expiresAt = "2026-12-01T10:00";
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[3\]\.startsAt: /);
  });

  it("не смешивает ошибку момента и битую ссылку: ссылки проверяются после исправления формы", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[0].expiresAt = "2026-02-30T10:00";
        file.permissions[1].serviceId = "vault";
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[0\]\.expiresAt: /);
  });

  it("игнорирует в версии 3 старые поля дней", () => {
    const result = parseWith((file) => {
      file.permissions[0].startsOn = "2026-12-14";
      file.permissions[0].endsOn = "не день";
    });

    expect(result).toEqual({ ok: true, config: seedConfig });
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

  it("переводит дни версии 2 в моменты: начало в 00:00, окончание на начало следующего дня", () => {
    const permissions = permissionsOf(
      legacy(2, [
        { startsOn: "2026-12-01", endsOn: "2026-12-14" },
        { startsOn: "2026-12-01" },
        { endsOn: "2026-12-14" },
      ]),
    );

    expect(permissions[0]).toMatchObject({
      startsAt: "2026-12-01T00:00",
      expiresAt: "2026-12-15T00:00",
    });
    expect(permissions[0]).not.toHaveProperty("startsOn");
    expect(permissions[0]).not.toHaveProperty("endsOn");
    expect(permissions[1]).toMatchObject({ startsAt: "2026-12-01T00:00" });
    expect(permissions[1]).not.toHaveProperty("expiresAt");
    expect(permissions[2]).toMatchObject({ expiresAt: "2026-12-15T00:00" });
    expect(permissions[2]).not.toHaveProperty("startsAt");
    expect(permissions[3]).toEqual(seedConfig.permissions[3]);
  });

  it("переводит окончание на границе месяца и года", () => {
    const permissions = permissionsOf(
      legacy(2, [{ endsOn: "2026-12-31" }, { endsOn: "2026-02-28" }, { endsOn: "2028-02-29" }]),
    );

    expect(permissions[0].expiresAt).toBe("2027-01-01T00:00");
    expect(permissions[1].expiresAt).toBe("2026-03-01T00:00");
    expect(permissions[2].expiresAt).toBe("2028-03-01T00:00");
  });

  it("не меняет доступ после перевода: 14.12.2026 23:59 доступ есть, 15.12.2026 00:00 нет", () => {
    const text = legacy(2, [{ startsOn: "2026-12-01", endsOn: "2026-12-14" }]);
    const parsed = parseConfigFile(text);
    const config: Config = parsed.ok ? parsed.config : seedConfig;
    const only: Config = { ...config, permissions: config.permissions.slice(0, 1) };
    const access = (at: Date) => calculateAccess(only, { userId: "anna", serviceId: "ledger", at });

    expect(access(new Date(2026, 11, 14, 23, 59)).granted).toBe(true);
    expect(access(new Date(2026, 11, 15, 0, 0)).granted).toBe(false);
    expect(access(new Date(2026, 11, 1, 0, 0)).granted).toBe(true);
    expect(access(new Date(2026, 10, 30, 23, 59)).granted).toBe(false);
  });

  it("читает в версии 2 только поля дней и игнорирует поля моментов", () => {
    const permissions = permissionsOf(
      legacy(2, [{ endsOn: "2026-12-14", startsAt: "ерунда", expiresAt: "2020-01-01T00:00" }]),
    );

    expect(permissions[0]).toMatchObject({ expiresAt: "2026-12-15T00:00" });
    expect(permissions[0]).not.toHaveProperty("startsAt");
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
      startsAt: "2026-12-10T00:00",
      expiresAt: "2026-12-11T00:00",
    });
  });
});

describe("отзыв разрешения в файле версии 3", () => {
  const withRevoke: Config = {
    ...seedConfig,
    permissions: [
      { ...seedConfig.permissions[0], revokedAt: "2026-12-10T12:00" },
      {
        ...seedConfig.permissions[1],
        startsAt: "2026-12-01T09:00",
        expiresAt: "2026-12-14T18:30",
        revokedAt: "2026-12-10T12:00",
      },
      ...seedConfig.permissions.slice(2),
    ],
  };

  it("возвращает отзыв после круга экспорта и импорта, версия остаётся 3", () => {
    const text = exportConfig(withRevoke);
    const result = parseConfigFile(text);

    expect(JSON.parse(text).version).toBe(3);
    expect(CONFIG_VERSION).toBe(3);
    expect(result).toEqual({ ok: true, config: withRevoke });
    expect(JSON.parse(text).permissions[2]).not.toHaveProperty("revokedAt");
  });

  it("читает прежний файл версии 3 без revokedAt", () => {
    const result = parseWith((file) => {
      file.permissions[0].startsAt = "2026-12-01T09:00";
    });

    expect(result.ok).toBe(true);
    const permissions = result.ok ? result.config.permissions : [];
    expect(permissions[0]).not.toHaveProperty("revokedAt");
  });

  it("отвергает несуществующий момент отзыва с указанием места", () => {
    const day = errorsOf(parseWith((file) => (file.permissions[1].revokedAt = "2026-02-30T10:00")));
    const wrongFormat = errorsOf(
      parseWith((file) => (file.permissions[0].revokedAt = "10.12.2026 12:00")),
    );
    const notString = errorsOf(parseWith((file) => (file.permissions[2].revokedAt = null)));

    expect(day).toEqual([
      "permissions[1].revokedAt: нужен реальный момент в формате ГГГГ-ММ-ДДTчч:мм",
    ]);
    expect(wrongFormat).toEqual([
      "permissions[0].revokedAt: нужен реальный момент в формате ГГГГ-ММ-ДДTчч:мм",
    ]);
    expect(notString[0]).toMatch(/^permissions\[2\]\.revokedAt: /);
  });

  it("отвергает отзыв не позже начала, равный и ранний", () => {
    const equal = errorsOf(
      parseWith((file) => {
        file.permissions[0].startsAt = "2026-12-10T12:00";
        file.permissions[0].revokedAt = "2026-12-10T12:00";
      }),
    );
    const earlier = errorsOf(
      parseWith((file) => {
        file.permissions[0].startsAt = "2026-12-10T12:00";
        file.permissions[0].revokedAt = "2026-12-10T11:59";
      }),
    );

    expect(equal).toEqual(["permissions[0]: отзыв должен быть позже начала"]);
    expect(earlier).toEqual(["permissions[0]: отзыв должен быть позже начала"]);
  });

  it("отвергает отзыв не раньше окончания, равный и поздний", () => {
    const equal = errorsOf(
      parseWith((file) => {
        file.permissions[1].expiresAt = "2026-12-14T18:00";
        file.permissions[1].revokedAt = "2026-12-14T18:00";
      }),
    );
    const later = errorsOf(
      parseWith((file) => {
        file.permissions[1].expiresAt = "2026-12-14T18:00";
        file.permissions[1].revokedAt = "2026-12-14T18:01";
      }),
    );

    expect(equal).toEqual(["permissions[1]: отзыв должен быть раньше окончания"]);
    expect(later).toEqual(["permissions[1]: отзыв должен быть раньше окончания"]);
  });

  it("принимает отзыв на минуту позже начала и на минуту раньше окончания", () => {
    const result = parseWith((file) => {
      file.permissions[0].startsAt = "2026-12-10T12:00";
      file.permissions[0].expiresAt = "2026-12-10T12:02";
      file.permissions[0].revokedAt = "2026-12-10T12:01";
    });

    expect(result.ok).toBe(true);
  });

  it("при неверном моменте отзыва не добавляет ошибку границ", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[0].startsAt = "2026-12-10T12:00";
        file.permissions[0].revokedAt = "2026-13-40T10:00";
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
      file.permissions[0].revokedAt = "2026-12-10T12:00";
    });

    expect(result).toEqual({ ok: true, config: seedConfig });
  });
});
