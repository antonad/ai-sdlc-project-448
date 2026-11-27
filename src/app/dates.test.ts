import { afterEach, describe, expect, it, vi } from "vitest";
import { dateToDay, formatDate, formatInterval, intervalError, isValidDate } from "./dates";

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

describe("intervalError", () => {
  it("не находит ошибки без границ", () => {
    expect(intervalError(undefined, undefined)).toBeUndefined();
  });

  it("не находит ошибки при одной границе", () => {
    expect(intervalError("2026-12-01", undefined)).toBeUndefined();
    expect(intervalError(undefined, "2026-12-14")).toBeUndefined();
  });

  it("принимает равные границы и обычный интервал", () => {
    expect(intervalError("2026-12-10", "2026-12-10")).toBeUndefined();
    expect(intervalError("2026-12-01", "2026-12-14")).toBeUndefined();
  });

  it("отвергает окончание раньше начала", () => {
    expect(intervalError("2026-12-14", "2026-12-01")).toBe("Дата окончания раньше даты начала");
  });

  it("отвергает невалидную дату в любой границе", () => {
    expect(intervalError("2026-02-30", undefined)).toBeTruthy();
    expect(intervalError(undefined, "14.12.2026")).toBeTruthy();
    expect(intervalError("2026-12-01", "ерунда")).toBeTruthy();
  });
});

describe("dateToDay", () => {
  it("возвращает локальную полночь указанного дня", () => {
    const result = dateToDay("2026-12-14");

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(11);
    expect(result.getDate()).toBe(14);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it("для пустой строки возвращает текущий момент", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 15, 30));

    expect(dateToDay("")).toEqual(new Date(2026, 5, 1, 15, 30));
    expect(dateToDay(undefined)).toEqual(new Date(2026, 5, 1, 15, 30));
  });

  it("для невалидной строки возвращает текущий момент", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 15, 30));

    expect(dateToDay("2026-02-30")).toEqual(new Date(2026, 5, 1, 15, 30));
    expect(dateToDay("14.12.2026")).toEqual(new Date(2026, 5, 1, 15, 30));
  });
});

describe("formatDate", () => {
  it("переводит ГГГГ-ММ-ДД в ДД.ММ.ГГГГ", () => {
    expect(formatDate("2026-12-14")).toBe("14.12.2026");
    expect(formatDate("2026-01-05")).toBe("05.01.2026");
  });
});

describe("formatInterval", () => {
  it("пишет «бессрочно» без границ", () => {
    expect(formatInterval({})).toBe("бессрочно");
  });

  it("пишет только начало", () => {
    expect(formatInterval({ startsOn: "2026-12-01" })).toBe("с 01.12.2026");
  });

  it("пишет только окончание", () => {
    expect(formatInterval({ endsOn: "2026-12-14" })).toBe("по 14.12.2026");
  });

  it("пишет обе границы", () => {
    expect(formatInterval({ startsOn: "2026-12-01", endsOn: "2026-12-14" })).toBe(
      "с 01.12.2026 по 14.12.2026",
    );
  });
});
