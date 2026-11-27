// Моменты разрешений. В модели, файле и хранилище момент это UTC `ГГГГ-ММ-ДДTчч:ммZ` (минуты, без
// секунд). Поля экрана `datetime-local` и `evaluation-time` дают локальное время браузера
// `ГГГГ-ММ-ДДTчч:мм`: слой приложения переводит его в UTC и обратно. День `ГГГГ-ММ-ДД` нужен только
// для перевода файлов версии 2. Слой приложения берёт текущее время; расчёт срока живёт в domain.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MOMENT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(Z?)$/;

const pad = (value: number, length: number) => String(value).padStart(length, "0");

// Годы 0–99 `Date` трактует как 1900–1999, а год 10000 не помещается в `ГГГГ`: допустимы 1000–9999.
const isRealDay = (year: number, month: number, day: number): boolean => {
  if (year < 1000 || year > 9999) {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

/** Строго `ГГГГ-ММ-ДД` и реальная дата: `2026-02-30` отвергается. */
export const isValidDate = (text: string): boolean => {
  const match = DATE_PATTERN.exec(text);
  return match !== null && isRealDay(Number(match[1]), Number(match[2]), Number(match[3]));
};

const isValidMomentText = (text: string, zone: "" | "Z"): boolean => {
  const match = MOMENT_PATTERN.exec(text);
  if (!match || match[6] !== zone) {
    return false;
  }
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  return isRealDay(year, month, day) && hour <= 23 && minute <= 59;
};

/** Локальный момент поля экрана: строго `ГГГГ-ММ-ДДTчч:мм`, реальная дата, часы 00–23, минуты 00–59. */
export const isValidMoment = (text: string): boolean => isValidMomentText(text, "");

/** Хранимый момент: строго `ГГГГ-ММ-ДДTчч:ммZ` (UTC), реальная дата, часы 00–23, минуты 00–59. */
export const isValidUtcMoment = (text: string): boolean => isValidMomentText(text, "Z");

/** Локальный момент поля экрана в хранимый UTC: `2026-12-01T14:00` при UTC+5 даёт `2026-12-01T09:00Z`. */
export const localToUtc = (local: string): string => {
  const [year, month, day, hour, minute] = local.split(/[-T:]/).map(Number);
  return `${new Date(year, month - 1, day, hour, minute).toISOString().slice(0, 16)}Z`;
};

/** Хранимый UTC-момент в локальное время браузера `ГГГГ-ММ-ДДTчч:мм` (для полей и показа). */
export const utcToLocal = (utc: string): string => {
  const [year, month, day, hour, minute] = utc.slice(0, 16).split(/[-T:]/).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const dayText = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
  return `${dayText}T${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}`;
};

/**
 * Текст ошибки интервала или `undefined`, если интервал допустим. Пустая граница не задана.
 * По умолчанию границы локальные (форма), `isValid` позволяет проверять хранимые UTC-значения.
 */
export const intervalError = (
  startsAt: string | undefined,
  expiresAt: string | undefined,
  isValid: (text: string) => boolean = isValidMoment,
): string | undefined => {
  if (startsAt !== undefined && !isValid(startsAt)) {
    return "Начало должно быть реальным моментом";
  }
  if (expiresAt !== undefined && !isValid(expiresAt)) {
    return "Окончание должно быть реальным моментом";
  }
  if (startsAt !== undefined && expiresAt !== undefined && expiresAt <= startsAt) {
    return "Окончание должно быть позже начала";
  }
  return undefined;
};

/**
 * Мгновение для локального момента поля экрана. Пустая или невалидная строка означает «сейчас»,
 * тогда берётся текущее время.
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

/** Начало дня `ГГГГ-ММ-ДД` в UTC как хранимый момент: `ГГГГ-ММ-ДДT00:00Z`. */
export const startOfDay = (day: string): string => `${day}T00:00Z`;

/** Начало следующего дня после `ГГГГ-ММ-ДД` в UTC как хранимый момент. Переносит месяц и год. */
export const startOfNextDay = (day: string): string => {
  const [year, month, date] = day.split("-").map(Number);
  return `${new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10)}T00:00Z`;
};

/** Хранимый UTC-момент в `ДД.ММ.ГГГГ чч:мм` по локальному времени браузера. */
export const formatMoment = (utc: string): string => {
  const [year, month, day, hour, minute] = utcToLocal(utc).split(/[-T:]/);
  return `${day}.${month}.${year} ${hour}:${minute}`;
};

/** Срок разрешения словами: «бессрочно», «с …», «до …» или «с … до …». Границы в UTC, показ локальный. */
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
