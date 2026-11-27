import type { Config, Subject } from "../domain/model";
import { isValidMoment } from "./dates";

const sameSubject = (left: Subject, right: Subject): boolean =>
  left.type === right.type && left.id === right.id;

const nextPermissionId = (config: Config): string => {
  const taken = new Set(config.permissions.map(({ id }) => id));
  let number = config.permissions.length + 1;
  while (taken.has(`p${number}`)) {
    number += 1;
  }
  return `p${number}`;
};

/** Срок разрешения: необязательные моменты `ГГГГ-ММ-ДДTчч:мм`, начало включительно, окончание исключительно. */
export type Interval = { startsAt?: string; expiresAt?: string };

/** Пустая строка и пробелы значат «граница не задана». */
const normalizeBound = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Нормализованный срок: незаданные границы отсутствуют в объекте совсем. */
export const normalizeInterval = (interval: Interval = {}): Interval => {
  const startsAt = normalizeBound(interval.startsAt);
  const expiresAt = normalizeBound(interval.expiresAt);
  return {
    ...(startsAt === undefined ? {} : { startsAt }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
};

/**
 * Выдаёт разрешение, постоянное или на интервал. Дубль — полное совпадение субъекта, сервиса
 * и обеих границ: тогда конфигурация не меняется (возвращается та же ссылка). Разрешение
 * с другим интервалом создаётся отдельной записью.
 */
export const addPermission = (
  config: Config,
  subject: Subject,
  serviceId: string,
  interval?: Interval,
): Config => {
  const { startsAt, expiresAt } = normalizeInterval(interval);
  const exists = config.permissions.some(
    (permission) =>
      sameSubject(permission.subject, subject) &&
      permission.serviceId === serviceId &&
      permission.startsAt === startsAt &&
      permission.expiresAt === expiresAt,
  );
  if (exists) {
    return config;
  }
  return {
    ...config,
    permissions: [
      ...config.permissions,
      {
        id: nextPermissionId(config),
        subject: { ...subject },
        serviceId,
        ...(startsAt === undefined ? {} : { startsAt }),
        ...(expiresAt === undefined ? {} : { expiresAt }),
      },
    ],
  };
};

/** Итог отзыва с момента: `revoked` — срок сокращён, остальное — причина отказа. */
export type RevokeFromResult =
  | "revoked"
  | "invalid-moment"
  | "unknown-permission"
  | "not-after-start"
  | "already-ended";

/**
 * Отзывает разрешение с момента `moment` (`ГГГГ-ММ-ДДTчч:мм`): момент — первая минута без
 * доступа, поэтому он становится окончанием. Меняет ровно одно разрешение.
 */
export const revokePermissionFrom = (
  config: Config,
  permissionId: string,
  moment: string,
): { config: Config; result: RevokeFromResult } => {
  const refuse = (result: RevokeFromResult) => ({ config, result });
  if (!isValidMoment(moment)) {
    return refuse("invalid-moment");
  }
  const target = config.permissions.find(({ id }) => id === permissionId);
  if (!target) {
    return refuse("unknown-permission");
  }
  if (target.startsAt !== undefined && moment <= target.startsAt) {
    return refuse("not-after-start");
  }
  if (target.expiresAt !== undefined && target.expiresAt <= moment) {
    return refuse("already-ended");
  }
  return {
    config: {
      ...config,
      permissions: config.permissions.map((permission) =>
        permission.id === permissionId ? { ...permission, expiresAt: moment } : permission,
      ),
    },
    result: "revoked",
  };
};

/** Снимает ровно одно разрешение по идентификатору. Остальные источники доступа не трогает. */
export const removePermission = (config: Config, permissionId: string): Config => ({
  ...config,
  permissions: config.permissions.filter(({ id }) => id !== permissionId),
});
