import type { Config, Permission } from "../domain/model";
import { carryOverRevocations } from "./permissions";

/** Что изменится в списке одного вида (пользователи, группы, сервисы) после подтверждения. */
export type EntityChange = {
  kind: "users" | "groups" | "services";
  added: number;
  removed: number;
  changed: number;
};

export type ImportPreview = {
  /** Конфигурация, которая будет сохранена после подтверждения (с перенесёнными отзывами). */
  result: Config;
  /** Разрешения, которых сейчас нет в конфигурации. */
  added: Permission[];
  /** Текущие разрешения, которых после подтверждения не будет. */
  removed: Permission[];
  /** Разрешения с тем же `id` и другим содержимым. */
  changed: { before: Permission; after: Permission }[];
  /** Отозванные сейчас разрешения, отзыв которых подтверждение сохранит (содержимое не меняется). */
  kept: Permission[];
  /** Различия пользователей, групп и сервисов; только те виды, где они есть. */
  entities: EntityChange[];
  /** Подтверждение ничего не изменит и ничего не сохраняет: показывать нечего. */
  empty: boolean;
};

const samePermission = (left: Permission, right: Permission): boolean =>
  left.id === right.id &&
  left.subject.type === right.subject.type &&
  left.subject.id === right.subject.id &&
  left.serviceId === right.serviceId &&
  left.startsAt === right.startsAt &&
  left.expiresAt === right.expiresAt &&
  left.revokedAt === right.revokedAt;

const sameEntity = (
  left: { id: string; name: string; groupIds?: string[] },
  right: { id: string; name: string; groupIds?: string[] },
): boolean =>
  left.name === right.name &&
  [...(left.groupIds ?? [])].sort().join("\n") === [...(right.groupIds ?? [])].sort().join("\n");

const entityChange = <T extends { id: string; name: string; groupIds?: string[] }>(
  kind: EntityChange["kind"],
  current: T[],
  next: T[],
): EntityChange => {
  const before = new Map(current.map((item) => [item.id, item]));
  const after = new Map(next.map((item) => [item.id, item]));
  return {
    kind,
    added: next.filter(({ id }) => !before.has(id)).length,
    removed: current.filter(({ id }) => !after.has(id)).length,
    changed: next.filter((item) => {
      const was = before.get(item.id);
      return was !== undefined && !sameEntity(was, item);
    }).length,
  };
};

/**
 * Считает, что изменится при подтверждении файла: сравнивает текущую конфигурацию с той, что
 * получится после `carryOverRevocations`, то есть ровно с тем, что импорт сохранит. Ничего не меняет.
 */
export const buildImportPreview = (current: Config, imported: Config): ImportPreview => {
  const result = carryOverRevocations(current, imported);
  const before = new Map(current.permissions.map((permission) => [permission.id, permission]));
  const after = new Map(result.permissions.map((permission) => [permission.id, permission]));
  const fromFile = new Map(imported.permissions.map((permission) => [permission.id, permission]));

  const added = result.permissions.filter(({ id }) => !before.has(id));
  const removed = current.permissions.filter(({ id }) => !after.has(id));
  const changed: ImportPreview["changed"] = [];
  const kept: Permission[] = [];
  for (const permission of result.permissions) {
    const was = before.get(permission.id);
    if (was === undefined) {
      continue;
    }
    if (!samePermission(was, permission)) {
      changed.push({ before: was, after: permission });
    } else if (
      was.revokedAt !== undefined &&
      fromFile.get(permission.id)?.revokedAt !== was.revokedAt
    ) {
      // Отзыв есть сейчас и в итоге, а файл его не содержит или содержит другой момент.
      kept.push(permission);
    }
  }

  const entities = [
    entityChange("users", current.users, result.users),
    entityChange("groups", current.groups, result.groups),
    entityChange("services", current.services, result.services),
  ].filter(({ added: a, removed: r, changed: c }) => a + r + c > 0);

  return {
    result,
    added,
    removed,
    changed,
    kept,
    entities,
    empty: added.length + removed.length + changed.length + kept.length + entities.length === 0,
  };
};
