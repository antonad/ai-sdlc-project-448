// Даты и моменты разрешений: строки без часового пояса. День `ГГГГ-ММ-ДД` нужен только для
// перевода старых файлов, момент `ГГГГ-ММ-ДДTчч:мм` (как у `datetime-local`) — основной формат.
// Слой приложения разбирает и форматирует их и берёт текущее время; расчёт срока живёт в domain.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOMENT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (value: number, length: number) => String(value).padStart(length, "0");

const isRealDay = (year: number, month: number, day: number): boolean => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

/** Строго `ГГГГ-ММ-ДД` и реальная дата: `2026-02-30` отвергается. */
export const isValidDate = (text: string): boolean => {
  const match = DATE_PATTERN.exec(text);
  return match !== null && isRealDay(Number(match[1]), Number(match[2]), Number(match[3]));
};

/** Строго `ГГГГ-ММ-ДДTчч:мм`, реальная дата, часы 00–23, минуты 00–59. */
export const isValidMoment = (text: string): boolean => {
  const match = MOMENT_PATTERN.exec(text);
  if (!match) {
    return false;
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return isRealDay(year, month, day) && hour <= 23 && minute <= 59;
};

/** Текст ошибки интервала или `undefined`, если интервал допустим. Пустая граница не задана. */
export const intervalError = (
  startsAt: string | undefined,
  expiresAt: string | undefined,
): string | undefined => {
  if (startsAt !== undefined && !isValidMoment(startsAt)) {
    return "Начало должно быть реальным моментом в формате ГГГГ-ММ-ДДTчч:мм";
  }
  if (expiresAt !== undefined && !isValidMoment(expiresAt)) {
    return "Окончание должно быть реальным моментом в формате ГГГГ-ММ-ДДTчч:мм";
  }
  if (startsAt !== undefined && expiresAt !== undefined && expiresAt <= startsAt) {
    return "Окончание должно быть позже начала";
  }
  return undefined;
};

/**
 * Момент расчёта: локальное время этого момента. Пустая или невалидная строка означает
 * «сейчас», тогда берётся текущее время.
 */
export const momentToDate = (text: string | undefined): Date => {
  if (text === undefined || !isValidMoment(text)) {
    return new Date();
  }
  const [year, month, day, hour, minute] = text.split(/[-T:]/).map(Number);
  return new Date(year, month - 1, day, hour, minute);
};

/** Текущая минута по локальному часовому поясу, `ГГГГ-ММ-ДДTчч:мм`. Часы читает слой приложения. */
export const nowMoment = (): string => {
  const now = new Date();
  const day = `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
  return `${day}T${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}`;
};

/** Начало дня `ГГГГ-ММ-ДД` как момент: `ГГГГ-ММ-ДДT00:00`. */
export const startOfDay = (day: string): string => `${day}T00:00`;

/** Начало следующего дня после `ГГГГ-ММ-ДД` как момент. Переносит месяц и год. */
export const startOfNextDay = (day: string): string => {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(year, month - 1, date + 1);
  return `${pad(next.getFullYear(), 4)}-${pad(next.getMonth() + 1, 2)}-${pad(next.getDate(), 2)}T00:00`;
};

/** `ГГГГ-ММ-ДДTчч:мм` в `ДД.ММ.ГГГГ чч:мм`. */
export const formatMoment = (text: string): string => {
  const [year, month, day, hour, minute] = text.split(/[-T:]/);
  return `${day}.${month}.${year} ${hour}:${minute}`;
};

/** Срок разрешения словами: «бессрочно», «с …», «до …» или «с … до …». */
export const formatInterval = ({
  startsAt,
  expiresAt,
}: {
  startsAt?: string;
  expiresAt?: string;
}): string => {
  if (startsAt !== undefined && expiresAt !== undefined) {
    return `с ${formatMoment(startsAt)} до ${formatMoment(expiresAt)}`;
  }
  if (startsAt !== undefined) {
    return `с ${formatMoment(startsAt)}`;
  }
  if (expiresAt !== undefined) {
    return `до ${formatMoment(expiresAt)}`;
  }
  return "бессрочно";
};
