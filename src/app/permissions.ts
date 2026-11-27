import type { Config, Subject } from "../domain/model";
import { isValidDate, previousDay } from "./dates";

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

/** Срок разрешения: необязательные границы `ГГГГ-ММ-ДД`, обе включительные. */
export type Interval = { startsOn?: string; endsOn?: string };

/** Пустая строка и пробелы значат «граница не задана». */
const normalizeBound = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Нормализованный срок: незаданные границы отсутствуют в объекте совсем. */
export const normalizeInterval = (interval: Interval = {}): Interval => {
  const startsOn = normalizeBound(interval.startsOn);
  const endsOn = normalizeBound(interval.endsOn);
  return {
    ...(startsOn === undefined ? {} : { startsOn }),
    ...(endsOn === undefined ? {} : { endsOn }),
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
  const { startsOn, endsOn } = normalizeInterval(interval);
  const exists = config.permissions.some(
    (permission) =>
      sameSubject(permission.subject, subject) &&
      permission.serviceId === serviceId &&
      permission.startsOn === startsOn &&
      permission.endsOn === endsOn,
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
        ...(startsOn === undefined ? {} : { startsOn }),
        ...(endsOn === undefined ? {} : { endsOn }),
      },
    ],
  };
};

/** Итог отзыва с даты: `revoked` — срок сокращён, остальное — причина отказа. */
export type RevokeFromResult =
  | "revoked"
  | "invalid-date"
  | "unknown-permission"
  | "not-after-start"
  | "already-ended";

/**
 * Отзывает разрешение с даты `date` (`ГГГГ-ММ-ДД`): дата — первый день без доступа, поэтому
 * окончание становится предыдущим днём. Меняет ровно одно разрешение.
 */
export const revokePermissionFrom = (
  config: Config,
  permissionId: string,
  date: string,
): { config: Config; result: RevokeFromResult } => {
  const refuse = (result: RevokeFromResult) => ({ config, result });
  if (!isValidDate(date)) {
    return refuse("invalid-date");
  }
  const target = config.permissions.find(({ id }) => id === permissionId);
  if (!target) {
    return refuse("unknown-permission");
  }
  const endsOn = previousDay(date);
  if (target.startsOn !== undefined && endsOn < target.startsOn) {
    return refuse("not-after-start");
  }
  if (target.endsOn !== undefined && target.endsOn <= endsOn) {
    return refuse("already-ended");
  }
  return {
    config: {
      ...config,
      permissions: config.permissions.map((permission) =>
        permission.id === permissionId ? { ...permission, endsOn } : permission,
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
