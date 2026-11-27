import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSimulator } from "./index";
import { loadConfig } from "./storage";

const vera = { type: "user", id: "vera" } as const;

// Тесты идут в поясе UTC+5 без летнего времени (`TZ` в vite.config.ts): локальное время = UTC + 5 ч.
describe("хук useSimulator: граница локального времени и UTC", () => {
  it("выдача переводит локальные поля в UTC и сохраняет их в браузере", () => {
    const { result } = renderHook(() => useSimulator());

    let outcome = "";
    act(() => {
      outcome = result.current.grantPermission(vera, "ledger", {
        startsAt: "2026-12-01T14:00",
        expiresAt: "2026-12-14T23:00",
      });
    });

    expect(outcome).toBe("granted");
    const added = result.current.config.permissions.at(-1);
    expect(added).toMatchObject({ startsAt: "2026-12-01T09:00Z", expiresAt: "2026-12-14T18:00Z" });
    expect(loadConfig(window.localStorage).permissions.at(-1)).toEqual(added);
  });

  it("отвергает выдачу, если после перевода момент выходит за допустимые годы", () => {
    const { result } = renderHook(() => useSimulator());
    const before = result.current.config;

    let outcome = "";
    act(() => {
      // Локальное 02:00 при UTC+5 это 21:00Z предыдущего дня, 31.12.0999: год вне диапазона.
      outcome = result.current.grantPermission(vera, "ledger", { startsAt: "1000-01-01T02:00" });
    });

    expect(outcome).toBe("invalid-interval");
    expect(result.current.config).toBe(before);
  });

  it("отвергает год вне диапазона уже в поле и не меняет конфигурацию", () => {
    const { result } = renderHook(() => useSimulator());
    const before = result.current.config;

    let outcome = "";
    act(() => {
      outcome = result.current.grantPermission(vera, "ledger", { expiresAt: "0050-01-01T00:00" });
    });

    expect(outcome).toBe("invalid-interval");
    expect(result.current.config).toBe(before);
  });

  it("отзыв переводит локальный момент в UTC", () => {
    const { result } = renderHook(() => useSimulator());
    act(() => {
      result.current.grantPermission(vera, "ledger", {
        startsAt: "2026-12-01T14:00",
        expiresAt: "2026-12-14T23:00",
      });
    });
    const id = result.current.config.permissions.at(-1)?.id ?? "";

    let outcome = "";
    act(() => {
      outcome = result.current.revokePermissionFrom(id, "2026-12-05T17:00");
    });

    expect(outcome).toBe("revoked");
    expect(result.current.config.permissions.at(-1)?.revokedAt).toBe("2026-12-05T12:00Z");
  });

  it("отзыв с пустым или неверным моментом отказывает и не меняет конфигурацию", () => {
    const { result } = renderHook(() => useSimulator());
    act(() => {
      result.current.grantPermission(vera, "ledger", { expiresAt: "2026-12-14T23:00" });
    });
    const id = result.current.config.permissions.at(-1)?.id ?? "";
    const before = result.current.config;

    for (const moment of ["", "2026-12-05", "2026-12-05T12:00Z", "ерунда", "2026-02-30T10:00"]) {
      let outcome = "";
      act(() => {
        outcome = result.current.revokePermissionFrom(id, moment);
      });
      expect(outcome).toBe("invalid-moment");
    }
    expect(result.current.config).toBe(before);
  });
});

describe("хук useSimulator: объяснение доступа", () => {
  it("переводит локальный момент в UTC и не меняет конфигурацию и хранилище", () => {
    const { result } = renderHook(() => useSimulator());
    act(() => {
      result.current.grantPermission(vera, "ledger", {
        startsAt: "2026-12-01T14:00",
        expiresAt: "2026-12-14T23:00",
      });
    });
    const id = result.current.config.permissions.at(-1)!.id;
    const before = result.current.config;
    const stored = window.localStorage.getItem(window.localStorage.key(0) ?? "");

    // Локальное 13:59 это 08:59Z, за минуту до начала (UTC+5).
    const early = result.current.explainAccess("vera", "ledger", "2026-12-01T13:59");
    const inside = result.current.explainAccess("vera", "ledger", "2026-12-01T14:00");

    expect(early.find((item) => item.permissionId === id)?.status).toBe("pending");
    expect(inside.find((item) => item.permissionId === id)?.status).toBe("active");
    expect(result.current.config).toBe(before);
    expect(window.localStorage.getItem(window.localStorage.key(0) ?? "")).toBe(stored);
  });
});
