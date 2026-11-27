import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatInterval,
  formatMoment,
  intervalError,
  isValidDate,
  isValidMoment,
  isValidUtcMoment,
  localToUtc,
  momentToDate,
  nowMoment,
  startOfDay,
  startOfNextDay,
  utcToLocal,
} from "./dates";

// Тесты идут в поясе Asia/Yekaterinburg (UTC+5, без летнего времени): `process.env.TZ` в vite.config.ts.

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

describe("isValidMoment (локальный момент поля экрана)", () => {
  it("принимает реальный момент в формате ГГГГ-ММ-ДДTчч:мм", () => {
    expect(isValidMoment("2026-12-14T18:00")).toBe(true);
    expect(isValidMoment("2026-12-14T00:00")).toBe(true);
    expect(isValidMoment("2026-12-14T23:59")).toBe(true);
  });

  it("принимает 29 февраля високосного года и отвергает невисокосного", () => {
    expect(isValidMoment("2028-02-29T10:00")).toBe(true);
    expect(isValidMoment("2026-02-29T10:00")).toBe(false);
  });

  it("принимает годы 1000–9999 и отвергает остальные", () => {
    expect(isValidMoment("1000-01-01T00:00")).toBe(true);
    expect(isValidMoment("9999-12-31T23:59")).toBe(true);
    expect(isValidMoment("0999-12-31T23:59")).toBe(false);
    expect(isValidMoment("0050-01-01T00:00")).toBe(false);
    expect(isValidUtcMoment("0050-01-01T00:00Z")).toBe(false);
    expect(isValidDate("0050-01-01")).toBe(false);
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

  it("отвергает значение с Z: это хранимый UTC-момент", () => {
    expect(isValidMoment("2026-12-14T18:00Z")).toBe(false);
  });
});

describe("isValidUtcMoment (хранимый момент)", () => {
  it("принимает реальный момент в формате ГГГГ-ММ-ДДTчч:ммZ", () => {
    expect(isValidUtcMoment("2026-12-14T18:00Z")).toBe(true);
    expect(isValidUtcMoment("2026-12-14T00:00Z")).toBe(true);
    expect(isValidUtcMoment("2026-12-14T23:59Z")).toBe(true);
  });

  it("принимает 29 февраля високосного года и отвергает невисокосного", () => {
    expect(isValidUtcMoment("2028-02-29T10:00Z")).toBe(true);
    expect(isValidUtcMoment("2026-02-29T10:00Z")).toBe(false);
  });

  it("отвергает значение без Z", () => {
    expect(isValidUtcMoment("2026-12-14T18:00")).toBe(false);
  });

  it("отвергает несуществующий день", () => {
    expect(isValidUtcMoment("2026-02-30T10:00Z")).toBe(false);
    expect(isValidUtcMoment("2026-13-01T10:00Z")).toBe(false);
  });

  it("отвергает часы и минуты вне диапазона", () => {
    expect(isValidUtcMoment("2026-03-01T25:00Z")).toBe(false);
    expect(isValidUtcMoment("2026-03-01T24:00Z")).toBe(false);
    expect(isValidUtcMoment("2026-03-01T09:60Z")).toBe(false);
  });

  it("отвергает пробелы, секунды, строчную z, смещение и пустую строку", () => {
    expect(isValidUtcMoment(" 2026-03-01T09:00Z")).toBe(false);
    expect(isValidUtcMoment("2026-03-01T09:00Z ")).toBe(false);
    expect(isValidUtcMoment("2026-03-01T09:00:30Z")).toBe(false);
    expect(isValidUtcMoment("2026-03-01T09:00z")).toBe(false);
    expect(isValidUtcMoment("2026-03-01T09:00+05:00")).toBe(false);
    expect(isValidUtcMoment("")).toBe(false);
  });
});

describe("localToUtc", () => {
  it("переводит локальное время в UTC: при UTC+5 минус пять часов", () => {
    expect(localToUtc("2026-12-01T14:00")).toBe("2026-12-01T09:00Z");
  });

  it("переходит через границу суток назад", () => {
    expect(localToUtc("2026-12-14T03:30")).toBe("2026-12-13T22:30Z");
  });

  it("переходит через границу года назад", () => {
    expect(localToUtc("2027-01-01T04:30")).toBe("2026-12-31T23:30Z");
  });
});

describe("utcToLocal", () => {
  it("переводит UTC в локальное время: при UTC+5 плюс пять часов", () => {
    expect(utcToLocal("2026-12-01T09:00Z")).toBe("2026-12-01T14:00");
  });

  it("переходит через границу суток вперёд", () => {
    expect(utcToLocal("2026-12-13T22:30Z")).toBe("2026-12-14T03:30");
  });

  it("переходит через границу года вперёд", () => {
    expect(utcToLocal("2026-12-31T23:30Z")).toBe("2027-01-01T04:30");
  });

  it("возвращает исходное локальное значение туда и обратно", () => {
    for (const local of [
      "2026-12-01T14:00",
      "2027-01-01T00:00",
      "2028-02-29T23:59",
      "2026-06-15T02:05",
    ]) {
      expect(utcToLocal(localToUtc(local))).toBe(local);
    }
  });

  it("возвращает исходный UTC-момент обратно и туда", () => {
    for (const utc of ["2026-12-01T09:00Z", "2026-12-31T23:30Z", "2028-02-29T00:00Z"]) {
      expect(localToUtc(utcToLocal(utc))).toBe(utc);
    }
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
    const message = "Начало должно быть реальным моментом";

    expect(intervalError("2026-02-30T10:00", undefined)).toBe(message);
    expect(intervalError("2026-12-01", "2026-12-14T18:00")).toBe(message);
  });

  it("называет невалидное окончание", () => {
    const message = "Окончание должно быть реальным моментом";

    expect(intervalError(undefined, "14.12.2026 18:00")).toBe(message);
    expect(intervalError("2026-12-01T09:00", "ерунда")).toBe(message);
  });

  it("по умолчанию отвергает границы с Z как не локальные", () => {
    expect(intervalError("2026-12-01T09:00Z", undefined)).toBe(
      "Начало должно быть реальным моментом",
    );
  });

  it("с isValidUtcMoment проверяет хранимые UTC-границы", () => {
    expect(
      intervalError("2026-12-01T09:00Z", "2026-12-14T18:00Z", isValidUtcMoment),
    ).toBeUndefined();
    expect(intervalError("2026-12-14T18:00Z", "2026-12-01T09:00Z", isValidUtcMoment)).toBe(
      "Окончание должно быть позже начала",
    );
    expect(intervalError("2026-12-10T09:00Z", "2026-12-10T09:00Z", isValidUtcMoment)).toBe(
      "Окончание должно быть позже начала",
    );
  });

  it("с isValidUtcMoment отвергает границы без Z и несуществующие дни", () => {
    expect(intervalError("2026-12-01T09:00", undefined, isValidUtcMoment)).toBe(
      "Начало должно быть реальным моментом",
    );
    expect(intervalError(undefined, "2026-02-30T10:00Z", isValidUtcMoment)).toBe(
      "Окончание должно быть реальным моментом",
    );
  });
});

describe("momentToDate", () => {
  it("возвращает мгновение локального момента: при UTC+5 14:00 это 09:00 UTC", () => {
    const result = momentToDate("2026-12-01T14:00");

    expect(result.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(result).toEqual(new Date(2026, 11, 1, 14, 0));
  });

  it("возвращает локальную дату и время указанного момента", () => {
    expect(momentToDate("2026-12-14T18:30")).toEqual(new Date(2026, 11, 14, 18, 30));
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
    expect(momentToDate("2026-12-14T18:00Z")).toEqual(new Date(2026, 5, 1, 15, 30));
  });
});

describe("nowMoment", () => {
  it("возвращает текущую локальную минуту в формате ГГГГ-ММ-ДДTчч:мм", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 27, 23, 59));

    expect(nowMoment()).toBe("2026-11-27T23:59");
  });

  it("дополняет нулями и отбрасывает секунды", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 7, 4, 59));

    expect(nowMoment()).toBe("2026-01-05T07:04");
  });

  it("показывает локальное время, а не UTC: 2026-12-31T23:30Z при UTC+5 это уже 2027 год", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:30:15Z"));

    expect(nowMoment()).toBe("2027-01-01T04:30");
  });
});

describe("startOfDay", () => {
  it("возвращает полночь указанного дня по UTC с Z", () => {
    expect(startOfDay("2026-12-14")).toBe("2026-12-14T00:00Z");
  });

  it("не зависит от пояса: 29 февраля и начало года", () => {
    expect(startOfDay("2028-02-29")).toBe("2028-02-29T00:00Z");
    expect(startOfDay("2027-01-01")).toBe("2027-01-01T00:00Z");
  });
});

describe("startOfNextDay", () => {
  it("возвращает полночь следующего дня по UTC внутри месяца", () => {
    expect(startOfNextDay("2026-11-27")).toBe("2026-11-28T00:00Z");
  });

  it("переходит через границу месяца и года", () => {
    expect(startOfNextDay("2026-11-30")).toBe("2026-12-01T00:00Z");
    expect(startOfNextDay("2026-12-31")).toBe("2027-01-01T00:00Z");
  });

  it("учитывает 29 февраля високосного года", () => {
    expect(startOfNextDay("2028-02-28")).toBe("2028-02-29T00:00Z");
    expect(startOfNextDay("2028-02-29")).toBe("2028-03-01T00:00Z");
    expect(startOfNextDay("2027-02-28")).toBe("2027-03-01T00:00Z");
  });
});

describe("formatMoment", () => {
  it("переводит UTC-момент в ДД.ММ.ГГГГ чч:мм по локальному времени (UTC+5)", () => {
    expect(formatMoment("2026-12-14T18:00Z")).toBe("14.12.2026 23:00");
    expect(formatMoment("2026-01-05T04:05Z")).toBe("05.01.2026 09:05");
  });

  it("переносит день и год по локальному времени", () => {
    expect(formatMoment("2026-12-31T23:30Z")).toBe("01.01.2027 04:30");
  });
});

describe("formatInterval", () => {
  it("пишет «бессрочно» без границ", () => {
    expect(formatInterval({})).toBe("бессрочно");
  });

  it("пишет только начало в локальном показе", () => {
    expect(formatInterval({ startsAt: "2026-12-01T09:00Z" })).toBe("с 01.12.2026 14:00");
  });

  it("пишет только окончание в локальном показе", () => {
    expect(formatInterval({ expiresAt: "2026-12-14T18:00Z" })).toBe("до 14.12.2026 23:00");
  });

  it("пишет обе границы в локальном показе", () => {
    expect(formatInterval({ startsAt: "2026-12-01T09:00Z", expiresAt: "2026-12-14T18:00Z" })).toBe(
      "с 01.12.2026 14:00 до 14.12.2026 23:00",
    );
  });
});
