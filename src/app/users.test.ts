import { describe, expect, it } from "vitest";
import type { Config } from "../domain/model";
import { usersInGroup } from "./users";

const config: Config = {
  users: [
    { id: "anna", name: "Анна", groupIds: ["accounting", "support"] },
    { id: "boris", name: "Борис", groupIds: ["support"] },
    { id: "vera", name: "Вера", groupIds: [] },
    { id: "gleb", name: "Глеб", groupIds: ["accounting"] },
  ],
  groups: [
    { id: "accounting", name: "Бухгалтерия" },
    { id: "support", name: "Поддержка" },
  ],
  services: [],
  permissions: [],
};

const ids = (groupId: string) => usersInGroup(config, groupId).map((user) => user.id);

describe("usersInGroup", () => {
  it("при пустой группе возвращает всех сотрудников", () => {
    expect(ids("")).toEqual(["anna", "boris", "vera", "gleb"]);
  });

  it("при выбранной группе возвращает только её участников в порядке конфигурации", () => {
    expect(ids("accounting")).toEqual(["anna", "gleb"]);
  });

  it("сотрудник из нескольких групп есть в списке каждой", () => {
    expect(ids("support")).toEqual(["anna", "boris"]);
  });

  it("сотрудник без группы есть только при пустой группе", () => {
    expect(ids("")).toContain("vera");
    expect(ids("accounting")).not.toContain("vera");
    expect(ids("support")).not.toContain("vera");
  });

  it("неизвестная группа даёт пустой список", () => {
    expect(ids("ghosts")).toEqual([]);
  });
});
