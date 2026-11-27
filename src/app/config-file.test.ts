import { describe, expect, it } from "vitest";
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

describe("срок разрешения в файле", () => {
  const withTerms = {
    ...seedConfig,
    permissions: [
      { ...seedConfig.permissions[0], startsOn: "2026-12-01", endsOn: "2026-12-14" },
      { ...seedConfig.permissions[1], startsOn: "2026-12-01" },
      { ...seedConfig.permissions[2], endsOn: "2026-12-14" },
      ...seedConfig.permissions.slice(3),
    ],
  };

  it("пишет в экспорт версию 2", () => {
    expect(CONFIG_VERSION).toBe(2);
    expect(JSON.parse(exportConfig(seedConfig)).version).toBe(2);
  });

  it("возвращает постоянное, интервальное и одностороннее разрешения после круга", () => {
    const result = parseConfigFile(exportConfig(withTerms));
    const permissions = result.ok ? result.config.permissions : [];

    expect(result).toEqual({ ok: true, config: withTerms });
    expect(permissions[0]).toMatchObject({ startsOn: "2026-12-01", endsOn: "2026-12-14" });
    expect(permissions[1]).not.toHaveProperty("endsOn");
    expect(permissions[2]).not.toHaveProperty("startsOn");
    expect(permissions[3]).not.toHaveProperty("startsOn");
    expect(permissions[3]).not.toHaveProperty("endsOn");
  });

  it("не пишет в файл поля срока у постоянного разрешения", () => {
    const file = JSON.parse(exportConfig(seedConfig));

    expect(file.permissions[0]).not.toHaveProperty("startsOn");
    expect(file.permissions[0]).not.toHaveProperty("endsOn");
  });

  it("принимает файл версии 1 и оставляет разрешения постоянными", () => {
    const result = parseWith((file) => (file.version = 1));

    expect(result).toEqual({ ok: true, config: seedConfig });
  });

  it("отвергает версию 3", () => {
    expect(errorsOf(parseWith((file) => (file.version = 3)))).toEqual([
      "Версия формата 3 новее поддерживаемой 2",
    ]);
  });

  it("отвергает несуществующую дату окончания с указанием места", () => {
    const errors = errorsOf(parseWith((file) => (file.permissions[1].endsOn = "2026-02-30")));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[1\]\.endsOn: /);
  });

  it("отвергает дату начала в неверном формате с указанием места", () => {
    const errors = errorsOf(parseWith((file) => (file.permissions[2].startsOn = "14.12.2026")));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[2\]\.startsOn: /);
  });

  it("отвергает значение не строкой", () => {
    const start = errorsOf(parseWith((file) => (file.permissions[0].startsOn = 20261201)));
    const end = errorsOf(parseWith((file) => (file.permissions[0].endsOn = null)));

    expect(start[0]).toMatch(/^permissions\[0\]\.startsOn: /);
    expect(end[0]).toMatch(/^permissions\[0\]\.endsOn: /);
  });

  it("отвергает окончание раньше начала с указанием разрешения", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[3].startsOn = "2026-12-14";
        file.permissions[3].endsOn = "2026-12-01";
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[3\]: /);
    expect(errors[0]).not.toMatch(/^permissions\[3\]\./);
  });

  it("при невалидной дате сообщает только ошибку поля, без ошибки пары", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[3].startsOn = "2026-13-40";
        file.permissions[3].endsOn = "2026-12-01";
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[3\]\.startsOn: /);
  });

  it("принимает равные границы", () => {
    const result = parseWith((file) => {
      file.permissions[0].startsOn = "2026-12-10";
      file.permissions[0].endsOn = "2026-12-10";
    });

    expect(result.ok).toBe(true);
  });

  it("не смешивает ошибку даты и битую ссылку: ссылки проверяются после исправления формы", () => {
    const errors = errorsOf(
      parseWith((file) => {
        file.permissions[0].endsOn = "2026-02-30";
        file.permissions[1].serviceId = "vault";
      }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^permissions\[0\]\.endsOn: /);
  });
});
