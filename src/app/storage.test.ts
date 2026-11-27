import { beforeEach, describe, expect, it } from "vitest";
import { exportConfig } from "./config-file";
import { seedConfig } from "./seed";
import { STORAGE_KEY, loadConfig, saveConfig } from "./storage";

const createStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
};

describe("хранение конфигурации в браузере", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = createStorage();
  });

  it("отдаёт учебные данные, пока ничего не сохранено", () => {
    expect(loadConfig(storage)).toEqual(seedConfig);
  });

  it("возвращает сохранённую конфигурацию", () => {
    const changed = { ...seedConfig, permissions: seedConfig.permissions.slice(1) };
    saveConfig(storage, changed);

    expect(loadConfig(storage)).toEqual(changed);
  });

  it("хранит конфигурацию в том же формате, что и экспорт", () => {
    saveConfig(storage, seedConfig);

    expect(storage.getItem(STORAGE_KEY)).toBe(exportConfig(seedConfig));
  });

  it("читает сохранённую копию версии 1, а не учебные данные", () => {
    const changed = { ...seedConfig, permissions: seedConfig.permissions.slice(1) };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...changed }));

    expect(loadConfig(storage)).toEqual(changed);
  });

  it("читает сохранённую копию версии 2 с переводом дней в моменты, а не учебные данные", () => {
    const changed = {
      ...seedConfig,
      permissions: [
        { ...seedConfig.permissions[0], startsOn: "2026-12-01", endsOn: "2026-12-31" },
        ...seedConfig.permissions.slice(1, 3),
      ],
    };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ...changed }));

    const loaded = loadConfig(storage);

    expect(loaded).not.toEqual(seedConfig);
    expect(loaded.permissions).toEqual([
      {
        ...seedConfig.permissions[0],
        startsAt: "2026-12-01T00:00",
        expiresAt: "2027-01-01T00:00",
      },
      ...seedConfig.permissions.slice(1, 3),
    ]);
  });

  it("возвращается к учебным данным, если в копии версии 3 несуществующий момент", () => {
    const broken = {
      version: 3,
      ...seedConfig,
      permissions: [{ ...seedConfig.permissions[0], expiresAt: "2026-02-30T10:00" }],
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(broken));

    expect(loadConfig(storage)).toEqual(seedConfig);
  });

  it("после сохранения копия содержит версию 3 со сроками в моментах", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        ...seedConfig,
        permissions: [{ ...seedConfig.permissions[0], endsOn: "2026-12-14" }],
      }),
    );

    saveConfig(storage, loadConfig(storage));

    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    expect(saved.version).toBe(3);
    expect(saved.permissions[0]).toMatchObject({ expiresAt: "2026-12-15T00:00" });
    expect(saved.permissions[0]).not.toHaveProperty("endsOn");
  });

  it("возвращается к учебным данным, если сохранённое повреждено", () => {
    storage.setItem(STORAGE_KEY, "{oops");

    expect(loadConfig(storage)).toEqual(seedConfig);
  });

  it("отдаёт учебные данные, если чтение хранилища бросает ошибку", () => {
    const closed = {
      ...storage,
      getItem: () => {
        throw new Error("доступ закрыт");
      },
    } as Storage;

    expect(loadConfig(closed)).toEqual(seedConfig);
  });

  it("не падает, если запись в хранилище бросает ошибку", () => {
    const full = {
      ...storage,
      setItem: () => {
        throw new Error("хранилище переполнено");
      },
    } as Storage;

    expect(() => saveConfig(full, seedConfig)).not.toThrow();
  });

  it("возвращается к учебным данным, если сохранённое нарушает ссылочную целостность", () => {
    const broken = { ...seedConfig, services: [] };
    storage.setItem(STORAGE_KEY, exportConfig(broken));

    expect(loadConfig(storage)).toEqual(seedConfig);
  });

  it("читает сохранённую копию версии 3 с отзывом разрешения", () => {
    const revoked = {
      ...seedConfig,
      permissions: [
        { ...seedConfig.permissions[0], revokedAt: "2026-12-10T12:00" },
        ...seedConfig.permissions.slice(1, 3),
      ],
    };
    saveConfig(storage, revoked);

    const loaded = loadConfig(storage);

    expect(loaded).toEqual(revoked);
    expect(loaded.permissions[0].revokedAt).toBe("2026-12-10T12:00");
  });
});
