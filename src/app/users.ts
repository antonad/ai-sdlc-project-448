import type { Config, User } from "../domain/model";

/** Сотрудники для списка выбора. Пустой `groupId` означает «все группы». Порядок как в конфигурации. */
export const usersInGroup = (config: Config, groupId: string): User[] =>
  groupId === "" ? config.users : config.users.filter((user) => user.groupIds.includes(groupId));
