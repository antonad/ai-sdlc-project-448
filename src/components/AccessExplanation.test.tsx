import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { Config } from "../app";
import { exportConfig } from "../app/config-file";
import { seedConfig } from "../app/seed";
import { STORAGE_KEY } from "../app/storage";
import { App } from "./App";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Тесты идут в поясе UTC+5 (`TZ` в vite.config.ts): локальное время = UTC + 5 ч.
const withPermissions = (permissions: Config["permissions"]): Config => ({
  ...seedConfig,
  permissions,
});

const renderWith = async (config: Config, user: string, service: string) => {
  localStorage.setItem(STORAGE_KEY, exportConfig(config));
  render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );
  const events = userEvent.setup();
  await events.selectOptions(screen.getByTestId("user-select"), user);
  await events.selectOptions(screen.getByTestId("service-select"), service);
};

const setMoment = (value: string) =>
  fireEvent.change(screen.getByTestId("evaluation-time"), { target: { value } });

const item = (id: string) => screen.getByTestId(`explanation-item-${id}`);
const items = () => screen.queryAllByTestId(/^explanation-item-/);

// Вера Лисицына входит в «Разработку». Интервал 10-20 марта 2026 по UTC.
const interval = { startsAt: "2026-03-10T00:00Z", expiresAt: "2026-03-20T00:00Z" };
const direct = (extra: Partial<Config["permissions"][number]> = {}) => ({
  id: "d1",
  subject: { type: "user", id: "vera" } as const,
  serviceId: "ledger",
  ...interval,
  ...extra,
});

describe("блок «Объяснение доступа»", () => {
  it("скрыт, пока пара не выбрана целиком", async () => {
    localStorage.setItem(STORAGE_KEY, exportConfig(seedConfig));
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );
    expect(screen.queryByTestId("access-explanation")).not.toBeInTheDocument();

    await userEvent.setup().selectOptions(screen.getByTestId("user-select"), "Вера Лисицына");
    expect(screen.queryByTestId("access-explanation")).not.toBeInTheDocument();
  });

  it("виден для выбранной пары и называет прямой и групповой источники", async () => {
    await renderWith(seedConfig, "Анна Белова", "Учёт");
    setMoment("2026-03-15T12:00");

    expect(screen.getByTestId("access-explanation")).toBeVisible();
    expect(items()).toHaveLength(2);
    expect(item("p1")).toHaveAttribute("data-status", "active");
    expect(item("p1")).toHaveTextContent("Прямое разрешение");
    expect(item("p1")).toHaveTextContent("действует");
    expect(item("p2")).toHaveAttribute("data-status", "active");
    expect(item("p2")).toHaveTextContent("Группа «Бухгалтерия»");
  });

  it("называет ещё не начавшееся и истёкшее разрешение, пока доступа нет", async () => {
    await renderWith(withPermissions([direct()]), "Вера Лисицына", "Учёт");

    // Локальное 09:59 10 марта это 04:59Z, за минуту до начала.
    setMoment("2026-03-10T04:59");
    expect(item("d1")).toHaveAttribute("data-status", "pending");
    expect(item("d1")).toHaveTextContent("ещё не началось");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");

    setMoment("2026-03-20T05:00");
    expect(item("d1")).toHaveAttribute("data-status", "expired");
    expect(item("d1")).toHaveTextContent("истекло");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
  });

  it("называет отозванное разрешение, пока срок ещё не вышел, и показывает действующее до отзыва", async () => {
    await renderWith(
      withPermissions([direct({ revokedAt: "2026-03-15T00:00Z" })]),
      "Вера Лисицына",
      "Учёт",
    );

    setMoment("2026-03-15T04:59");
    expect(item("d1")).toHaveAttribute("data-status", "active");

    setMoment("2026-03-15T05:00");
    expect(item("d1")).toHaveAttribute("data-status", "revoked");
    expect(item("d1")).toHaveTextContent("отозвано");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
  });

  it("после отзыва прямого разрешения сохраняет и называет действующую группу", async () => {
    await renderWith(
      withPermissions([
        direct({ serviceId: "repository", revokedAt: "2026-03-15T00:00Z" }),
        { id: "g1", subject: { type: "group", id: "development" }, serviceId: "repository" },
      ]),
      "Вера Лисицына",
      "Репозиторий",
    );
    setMoment("2026-03-16T12:00");

    expect(items()).toHaveLength(2);
    expect(item("d1")).toHaveAttribute("data-status", "revoked");
    expect(item("g1")).toHaveAttribute("data-status", "active");
    expect(item("g1")).toHaveTextContent("Группа «Разработка»");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  });

  it("называет отозванное разрешение группы отозванным у её участника", async () => {
    await renderWith(
      withPermissions([
        {
          id: "g1",
          subject: { type: "group", id: "development" },
          serviceId: "ledger",
          revokedAt: "2026-03-15T00:00Z",
        },
      ]),
      "Вера Лисицына",
      "Учёт",
    );
    setMoment("2026-03-16T12:00");

    expect(item("g1")).toHaveAttribute("data-status", "revoked");
    expect(item("g1")).toHaveTextContent("Группа «Разработка»");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
  });

  it("для пары без разрешений сообщает об этом и не показывает строк", async () => {
    await renderWith(seedConfig, "Вера Лисицына", "Учёт");

    expect(screen.getByTestId("access-explanation")).toHaveTextContent(
      "Разрешений для этой пары нет",
    );
    expect(items()).toHaveLength(0);
  });

  it("согласован с результатом расчёта на всех парах и моментах", async () => {
    const config = withPermissions([
      ...seedConfig.permissions,
      direct(),
      direct({ id: "d2", serviceId: "mail", revokedAt: "2026-03-12T00:00Z" }),
    ]);
    await renderWith(config, "Анна Белова", "Учёт");
    const events = userEvent.setup();

    for (const user of ["Анна Белова", "Борис Каримов", "Вера Лисицына"]) {
      for (const service of ["Учёт", "Репозиторий", "Почта"]) {
        await events.selectOptions(screen.getByTestId("user-select"), user);
        await events.selectOptions(screen.getByTestId("service-select"), service);
        for (const moment of ["2026-03-01T12:00", "2026-03-11T12:00", "2026-03-25T12:00"]) {
          setMoment(moment);
          const active = items().filter((el) => el.getAttribute("data-status") === "active");
          expect(
            screen.getByTestId("access-result"),
            `${user} ${service} ${moment}`,
          ).toHaveTextContent(active.length > 0 ? "Доступ есть" : "Доступа нет");
        }
      }
    }
  });

  it("считает разрешение прежнего формата без срока постоянным действующим", async () => {
    await renderWith(
      withPermissions([
        {
          id: "old",
          subject: { type: "user", id: "vera" },
          serviceId: "ledger",
        },
      ]),
      "Вера Лисицына",
      "Учёт",
    );

    for (const moment of ["2020-01-01T12:00", "2040-01-01T12:00"]) {
      setMoment(moment);
      expect(item("old")).toHaveAttribute("data-status", "active");
    }
  });

  it("не меняет сохранённую конфигурацию", async () => {
    await renderWith(seedConfig, "Анна Белова", "Учёт");
    const before = localStorage.getItem(STORAGE_KEY);

    setMoment("2026-03-15T12:00");

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
});
