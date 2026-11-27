// Даты разрешений: строки `ГГГГ-ММ-ДД` без времени и часового пояса.
// Слой приложения разбирает и форматирует их и берёт текущее время; расчёт срока живёт в domain.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Строго `ГГГГ-ММ-ДД` и реальная дата: `2026-02-30` отвергается. */
export const isValidDate = (text: string): boolean => {
  const match = DATE_PATTERN.exec(text);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

/** Текст ошибки интервала или `undefined`, если интервал допустим. Пустая граница не задана. */
export const intervalError = (
  startsOn: string | undefined,
  endsOn: string | undefined,
): string | undefined => {
  if (startsOn !== undefined && !isValidDate(startsOn)) {
    return "Дата начала должна быть реальной датой в формате ГГГГ-ММ-ДД";
  }
  if (endsOn !== undefined && !isValidDate(endsOn)) {
    return "Дата окончания должна быть реальной датой в формате ГГГГ-ММ-ДД";
  }
  if (startsOn !== undefined && endsOn !== undefined && endsOn < startsOn) {
    return "Дата окончания раньше даты начала";
  }
  return undefined;
};

/**
 * Момент расчёта для выбранного дня: локальная полночь этого дня. Пустая или невалидная
 * строка означает «сегодня», тогда берётся текущее время.
 */
export const dateToDay = (text: string | undefined): Date => {
  if (text === undefined || !isValidDate(text)) {
    return new Date();
  }
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** `ГГГГ-ММ-ДД` в `ДД.ММ.ГГГГ`. */
export const formatDate = (text: string): string => {
  const [year, month, day] = text.split("-");
  return `${day}.${month}.${year}`;
};

/** Срок разрешения словами: «бессрочно», «с …», «по …» или «с … по …». */
export const formatInterval = ({
  startsOn,
  endsOn,
}: {
  startsOn?: string;
  endsOn?: string;
}): string => {
  if (startsOn !== undefined && endsOn !== undefined) {
    return `с ${formatDate(startsOn)} по ${formatDate(endsOn)}`;
  }
  if (startsOn !== undefined) {
    return `с ${formatDate(startsOn)}`;
  }
  if (endsOn !== undefined) {
    return `по ${formatDate(endsOn)}`;
  }
  return "бессрочно";
};
