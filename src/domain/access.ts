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

/** Почему разрешение не действует в день расчёта: ещё не началось или уже закончилось. */
export type InactiveReason = "not-started" | "expired";

/** Подходящее сотруднику и сервису разрешение, которое не действует в день расчёта. */
export type InactivePermission = AccessSource & {
  reason: InactiveReason;
  /** Граница срока (`ГГГГ-ММ-ДД`), из-за которой разрешение не действует. */
  date: string;
};

export type AccessResult = {
  granted: boolean;
  sources: AccessSource[];
  inactive: InactivePermission[];
};

const pad = (value: number, length: number) => String(value).padStart(length, "0");

/** День момента `at` по локальному часовому поясу, `ГГГГ-ММ-ДД`. Строки одного формата сравнимы как текст. */
const dayKey = (at: Date) =>
  `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1, 2)}-${pad(at.getDate(), 2)}`;

/** Причина, по которой разрешение не действует в день `day`, или `undefined`, если действует. */
const inactivity = (
  { startsOn, endsOn }: Permission,
  day: string,
): { reason: InactiveReason; date: string } | undefined => {
  if (startsOn !== undefined && day < startsOn) return { reason: "not-started", date: startsOn };
  if (endsOn !== undefined && day > endsOn) return { reason: "expired", date: endsOn };
  return undefined;
};

export const calculateAccess = (config: Config, query: AccessQuery): AccessResult => {
  const user = config.users.find((candidate) => candidate.id === query.userId);
  const groupIds = user?.groupIds ?? [];
  const day = dayKey(query.at);
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
    const problem = inactivity(permission, day);
    if (problem) inactive.push({ ...source, ...problem });
    else sources.push(source);
  }

  return { granted: sources.length > 0, sources, inactive };
};
