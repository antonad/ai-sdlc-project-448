import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatInterval,
  formatMoment,
  intervalError,
  isValidDate,
  isValidMoment,
  momentToDate,
  nowMoment,
  startOfDay,
  startOfNextDay,
} from "./dates";

afterEach(() => {
  vi.useRealTimers();
});

describe("isValidDate", () => {
  it("принимает реальную дату в формате ГГГГ-ММ-ДД", () => {
    expect(isValidDate("2026-12-14")).toBe(true);
  });

  it("принимает 29 февраля високосного года и отвергает невисокосного", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
  });

  it("отвергает несуществующий день", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-00-10")).toBe(false);
  });

  it("отвергает другой формат, пустую строку и лишние символы", () => {
    expect(isValidDate("14.12.2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate("2026-1-5")).toBe(false);
    expect(isValidDate(" 2026-12-14")).toBe(false);
    expect(isValidDate("2026-12-14T00:00")).toBe(false);
  });
});

describe("isValidMoment", () => {
  it("принимает реальный момент в формате ГГГГ-ММ-ДДTчч:мм", () => {
    expect(isValidMoment("2026-12-14T18:00")).toBe(true);
    expect(isValidMoment("2026-12-14T00:00")).toBe(true);
    expect(isValidMoment("2026-12-14T23:59")).toBe(true);
  });

  it("принимает 29 февраля високосного года и отвергает невисокосного", () => {
    expect(isValidMoment("2028-02-29T10:00")).toBe(true);
    expect(isValidMoment("2026-02-29T10:00")).toBe(false);
  });

  it("отвергает несуществующий день", () => {
    expect(isValidMoment("2026-02-30T10:00")).toBe(false);
    expect(isValidMoment("2026-13-01T10:00")).toBe(false);
  });

  it("отвергает часы и минуты вне диапазона", () => {
    expect(isValidMoment("2026-03-01T25:00")).toBe(false);
    expect(isValidMoment("2026-03-01T24:00")).toBe(false);
    expect(isValidMoment("2026-03-01T09:60")).toBe(false);
  });

  it("отвергает дату без времени", () => {
    expect(isValidMoment("2026-03-01")).toBe(false);
    expect(isValidMoment("2026-03-01T")).toBe(false);
  });

  it("отвергает пробелы, секунды, другой разделитель и пустую строку", () => {
    expect(isValidMoment(" 2026-03-01T09:00")).toBe(false);
    expect(isValidMoment("2026-03-01T09:00 ")).toBe(false);
    expect(isValidMoment("2026-03-01 09:00")).toBe(false);
    expect(isValidMoment("2026-03-01T09:00:30")).toBe(false);
    expect(isValidMoment("")).toBe(false);
  });
});

describe("intervalError", () => {
  it("не находит ошибки без границ", () => {
    expect(intervalError(undefined, undefined)).toBeUndefined();
  });

  it("не находит ошибки при одной границе", () => {
    expect(intervalError("2026-12-01T09:00", undefined)).toBeUndefined();
    expect(intervalError(undefined, "2026-12-14T18:00")).toBeUndefined();
  });

  it("принимает обычный интервал и разницу в одну минуту", () => {
    expect(intervalError("2026-12-01T09:00", "2026-12-14T18:00")).toBeUndefined();
    expect(intervalError("2026-12-10T09:00", "2026-12-10T09:01")).toBeUndefined();
  });

  it("отвергает окончание раньше начала", () => {
    expect(intervalError("2026-12-14T18:00", "2026-12-01T09:00")).toBe(
      "Окончание должно быть позже начала",
    );
  });

  it("отвергает окончание, равное началу", () => {
    expect(intervalError("2026-12-10T09:00", "2026-12-10T09:00")).toBe(
      "Окончание должно быть позже начала",
    );
  });

  it("называет невалидное начало", () => {
    const message = "Начало должно быть реальным моментом в формате ГГГГ-ММ-ДДTчч:мм";

    expect(intervalError("2026-02-30T10:00", undefined)).toBe(message);
    expect(intervalError("2026-12-01", "2026-12-14T18:00")).toBe(message);
  });

  it("называет невалидное окончание", () => {
    const message = "Окончание должно быть реальным моментом в формате ГГГГ-ММ-ДДTчч:мм";

    expect(intervalError(undefined, "14.12.2026 18:00")).toBe(message);
    expect(intervalError("2026-12-01T09:00", "ерунда")).toBe(message);
  });
});

describe("momentToDate", () => {
  it("возвращает локальную дату и время указанного момента", () => {
    const result = momentToDate("2026-12-14T18:30");

    expect(result).toEqual(new Date(2026, 11, 14, 18, 30));
  });

  it("для пустого значения возвращает текущий момент", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 15, 30));

    expect(momentToDate("")).toEqual(new Date(2026, 5, 1, 15, 30));
    expect(momentToDate(undefined)).toEqual(new Date(2026, 5, 1, 15, 30));
  });

  it("для невалидной строки возвращает текущий момент", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 15, 30));

    expect(momentToDate("2026-02-30T10:00")).toEqual(new Date(2026, 5, 1, 15, 30));
    expect(momentToDate("2026-12-14")).toEqual(new Date(2026, 5, 1, 15, 30));
  });
});

describe("nowMoment", () => {
  it("возвращает текущую минуту в формате ГГГГ-ММ-ДДTчч:мм", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 27, 23, 59));

    expect(nowMoment()).toBe("2026-11-27T23:59");
  });

  it("дополняет нулями и отбрасывает секунды", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 7, 4, 59));

    expect(nowMoment()).toBe("2026-01-05T07:04");
  });
});

describe("startOfDay", () => {
  it("возвращает полночь указанного дня", () => {
    expect(startOfDay("2026-12-14")).toBe("2026-12-14T00:00");
  });
});

describe("startOfNextDay", () => {
  it("возвращает полночь следующего дня внутри месяца", () => {
    expect(startOfNextDay("2026-11-27")).toBe("2026-11-28T00:00");
  });

  it("переходит через границу месяца и года", () => {
    expect(startOfNextDay("2026-11-30")).toBe("2026-12-01T00:00");
    expect(startOfNextDay("2026-12-31")).toBe("2027-01-01T00:00");
  });

  it("учитывает 29 февраля високосного года", () => {
    expect(startOfNextDay("2028-02-28")).toBe("2028-02-29T00:00");
    expect(startOfNextDay("2028-02-29")).toBe("2028-03-01T00:00");
    expect(startOfNextDay("2027-02-28")).toBe("2027-03-01T00:00");
  });
});

describe("formatMoment", () => {
  it("переводит ГГГГ-ММ-ДДTчч:мм в ДД.ММ.ГГГГ чч:мм", () => {
    expect(formatMoment("2026-12-14T18:00")).toBe("14.12.2026 18:00");
    expect(formatMoment("2026-01-05T09:05")).toBe("05.01.2026 09:05");
  });
});

describe("formatInterval", () => {
  it("пишет «бессрочно» без границ", () => {
    expect(formatInterval({})).toBe("бессрочно");
  });

  it("пишет только начало", () => {
    expect(formatInterval({ startsAt: "2026-12-01T09:00" })).toBe("с 01.12.2026 09:00");
  });

  it("пишет только окончание", () => {
    expect(formatInterval({ expiresAt: "2026-12-14T18:00" })).toBe("до 14.12.2026 18:00");
  });

  it("пишет обе границы", () => {
    expect(formatInterval({ startsAt: "2026-12-01T09:00", expiresAt: "2026-12-14T18:00" })).toBe(
      "с 01.12.2026 09:00 до 14.12.2026 18:00",
    );
  });
});
