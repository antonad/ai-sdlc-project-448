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

  it("после сохранения копия содержит версию 2", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...seedConfig }));

    saveConfig(storage, loadConfig(storage));

    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}").version).toBe(2);
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
});
