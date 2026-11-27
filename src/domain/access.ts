import type { Config, Permission } from "./model";

export type AccessQuery = {
  userId: string;
  serviceId: string;
  /** Момент расчёта. Модуль не читает часы, время приходит от вызывающего. */
  at: Date;
};

export type AccessSource =
  | { kind: "direct"; permissionId: string }
  | { kind: "group"; permissionId: string; groupId: string };

/** Почему разрешение не действует в момент расчёта: ещё не началось или уже закончилось. */
export type InactiveReason = "not-started" | "expired" | "revoked";

/** Подходящее сотруднику и сервису разрешение, которое не действует в момент расчёта. */
export type InactivePermission = AccessSource & {
  reason: InactiveReason;
  /** Граница срока (`ГГГГ-ММ-ДДTчч:ммZ`), из-за которой разрешение не действует. */
  boundary: string;
};

export type AccessResult = {
  granted: boolean;
  sources: AccessSource[];
  inactive: InactivePermission[];
};

/**
 * Минута мгновения `at` в UTC, `ГГГГ-ММ-ДДTчч:ммZ`: секунды отбрасываются, часовой пояс не влияет.
 * Строки одного формата сравнимы как текст.
 */
const minuteKey = (at: Date) => `${at.toISOString().slice(0, 16)}Z`;

/** Причина, по которой разрешение не действует в минуту `key`, или `undefined`, если действует. Интервал `[startsAt, expiresAt)`, отзыв `revokedAt` обрывает его раньше. */
const inactivity = (
  { startsAt, expiresAt, revokedAt }: Permission,
  key: string,
): { reason: InactiveReason; boundary: string } | undefined => {
  if (startsAt !== undefined && key < startsAt)
    return { reason: "not-started", boundary: startsAt };
  // Отзыв считается причиной, только если он обрывает срок раньше окончания.
  const revokedFirst =
    revokedAt !== undefined && (expiresAt === undefined || revokedAt < expiresAt);
  if (revokedFirst && key >= revokedAt) return { reason: "revoked", boundary: revokedAt };
  if (expiresAt !== undefined && key >= expiresAt)
    return { reason: "expired", boundary: expiresAt };
  return undefined;
};

export const calculateAccess = (config: Config, query: AccessQuery): AccessResult => {
  const user = config.users.find((candidate) => candidate.id === query.userId);
  const groupIds = user?.groupIds ?? [];
  const key = minuteKey(query.at);
  const forService = config.permissions.filter(
    (permission) => permission.serviceId === query.serviceId,
  );

  const direct = forService.filter(
    ({ subject }) => subject.type === "user" && subject.id === query.userId,
  );
  const viaGroups = forService.filter(
    ({ subject }) => subject.type === "group" && groupIds.includes(subject.id),
  );

  // Прямые разрешения идут первыми, групповые следуют в порядке разрешений.
  const candidates: { permission: Permission; source: AccessSource }[] = [
    ...direct.map((permission): { permission: Permission; source: AccessSource } => ({
      permission,
      source: { kind: "direct", permissionId: permission.id },
    })),
    ...viaGroups.map((permission): { permission: Permission; source: AccessSource } => ({
      permission,
      source: { kind: "group", permissionId: permission.id, groupId: permission.subject.id },
    })),
  ];

  const sources: AccessSource[] = [];
  const inactive: InactivePermission[] = [];
  for (const { permission, source } of candidates) {
    const problem = inactivity(permission, key);
    if (problem) inactive.push({ ...source, ...problem });
    else sources.push(source);
  }

  return { granted: sources.length > 0, sources, inactive };
};
