import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../app";
import { exportConfig } from "../app/config-file";
import { seedConfig } from "../app/seed";
import { STORAGE_KEY } from "../app/storage";
import { App } from "./App";

afterEach(() => localStorage.clear());

const renderApp = () =>
  render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );

const pick = async (user: string, service: string) => {
  const events = userEvent.setup();
  await events.selectOptions(screen.getByTestId("user-select"), user);
  await events.selectOptions(screen.getByTestId("service-select"), service);
};

describe("экран расчёта доступа", () => {
  it("предлагает выбрать сотрудника и сервис до расчёта", () => {
    renderApp();

    expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  });

  it("просит выбрать и сервис, если выбран только сотрудник", async () => {
    renderApp();
    await userEvent.setup().selectOptions(screen.getByTestId("user-select"), "Анна Белова");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  });

  it("просит выбрать и сотрудника, если выбран только сервис", async () => {
    renderApp();
    await userEvent.setup().selectOptions(screen.getByTestId("service-select"), "Учёт");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  });

  it("показывает доступ по прямому разрешению", async () => {
    renderApp();
    await pick("Борис Каримов", "Репозиторий");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
  });

  it("показывает доступ по разрешению группы", async () => {
    renderApp();
    await pick("Вера Лисицына", "Репозиторий");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Разработка»");
  });

  it("показывает прямой и групповой источники вместе", async () => {
    renderApp();
    await pick("Анна Белова", "Учёт");

    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Бухгалтерия»");
  });

  it("сообщает об отсутствии доступа", async () => {
    renderApp();
    await pick("Вера Лисицына", "Учёт");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
  });
});

const userNames = () =>
  within(screen.getByTestId("user-select"))
    .getAllByRole("option")
    .map((option) => option.textContent);

describe("фильтр сотрудников по группе", () => {
  it("без выбранной группы в списке все сотрудники", () => {
    renderApp();

    expect(userNames()).toEqual(["Не выбран", "Анна Белова", "Борис Каримов", "Вера Лисицына"]);
  });

  it("после выбора группы в списке только её участники", async () => {
    renderApp();
    await userEvent.setup().selectOptions(screen.getByTestId("group-select"), "Бухгалтерия");

    expect(userNames()).toEqual(["Не выбран", "Анна Белова"]);
  });

  it("сбрасывает выбранного сотрудника, если он не входит в новую группу", async () => {
    renderApp();
    const events = userEvent.setup();
    await pick("Анна Белова", "Учёт");
    await events.selectOptions(screen.getByTestId("group-select"), "Поддержка");

    expect(screen.getByTestId("user-select")).toHaveValue("");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  });

  it("оставляет сотрудника выбранным, если он входит в новую группу", async () => {
    renderApp();
    const events = userEvent.setup();
    await pick("Анна Белова", "Учёт");
    await events.selectOptions(screen.getByTestId("group-select"), "Бухгалтерия");

    expect(screen.getByTestId("user-select")).toHaveValue("anna");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  });

  it("при возврате к «Все группы» полный список, выбранный сотрудник остаётся", async () => {
    renderApp();
    const events = userEvent.setup();
    await events.selectOptions(screen.getByTestId("group-select"), "Бухгалтерия");
    await events.selectOptions(screen.getByTestId("user-select"), "Анна Белова");
    await events.selectOptions(screen.getByTestId("group-select"), "Все группы");

    expect(userNames()).toHaveLength(4);
    expect(screen.getByTestId("user-select")).toHaveValue("anna");
  });

  it("результат расчёта не зависит от выбранной группы", async () => {
    renderApp();
    const events = userEvent.setup();
    await pick("Анна Белова", "Учёт");
    const without = screen.getByTestId("access-sources").textContent;
    await events.selectOptions(screen.getByTestId("group-select"), "Бухгалтерия");

    expect(screen.getByTestId("access-sources").textContent).toBe(without);
  });

  it("сотрудник без группы и сотрудник в двух группах ведут себя по спеке", async () => {
    const saved: Config = {
      users: [
        { id: "u1", name: "Двойной", groupIds: ["g1", "g2"] },
        { id: "u2", name: "Одинокий", groupIds: [] },
      ],
      groups: [
        { id: "g1", name: "Первая" },
        { id: "g2", name: "Вторая" },
      ],
      services: [],
      permissions: [],
    };
    localStorage.setItem(STORAGE_KEY, exportConfig(saved));
    renderApp();
    const events = userEvent.setup();

    expect(userNames()).toEqual(["Не выбран", "Двойной", "Одинокий"]);
    await events.selectOptions(screen.getByTestId("group-select"), "Первая");
    expect(userNames()).toEqual(["Не выбран", "Двойной"]);
    await events.selectOptions(screen.getByTestId("group-select"), "Вторая");
    expect(userNames()).toEqual(["Не выбран", "Двойной"]);
  });
});

describe("проверка на дату: разрешение «Северной»", () => {
  const seed = (extra: Config["permissions"]): string => {
    const base = JSON.parse(exportConfig(seedConfig));
    base.permissions.push(...extra);
    return JSON.stringify(base);
  };
  const contractor = {
    id: "s1",
    subject: { type: "user", id: "vera" },
    serviceId: "ledger",
    startsOn: "2026-12-01",
    endsOn: "2026-12-14",
  } as const;

  const setDate = (value: string) =>
    fireEvent.change(screen.getByTestId("access-date"), { target: { value } });

  const prepare = async (extra: Config["permissions"] = [contractor]) => {
    localStorage.setItem(STORAGE_KEY, seed(extra));
    renderApp();
    await pick("Вера Лисицына", "Учёт");
  };

  afterEach(() => vi.useRealTimers());

  it("показывает доступ в первый и последний день договора", async () => {
    await prepare();

    setDate("2026-12-01");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    setDate("2026-12-14");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
  });

  it("после окончания показывает отказ с причиной и датой", async () => {
    await prepare();

    setDate("2026-12-15");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.getByTestId("access-inactive")).toHaveTextContent(
      "Прямое разрешение: закончилось 14.12.2026",
    );
  });

  it("до начала показывает причину «ещё не началось»", async () => {
    await prepare();

    setDate("2026-11-30");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.getByTestId("access-inactive")).toHaveTextContent(
      "Прямое разрешение: ещё не началось, с 01.12.2026",
    );
  });

  it("называет группу в причине для группового разрешения", async () => {
    await prepare([{ ...contractor, subject: { type: "group", id: "development" } }]);

    setDate("2026-12-15");

    expect(screen.getByTestId("access-inactive")).toHaveTextContent(
      "Группа «Разработка»: закончилось 14.12.2026",
    );
  });

  it("при наличии доступа не показывает недействующие разрешения", async () => {
    await prepare([
      contractor,
      { id: "s2", subject: { type: "user", id: "vera" }, serviceId: "ledger" },
    ]);

    setDate("2026-12-15");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.queryByTestId("access-inactive")).not.toBeInTheDocument();
  });

  it("с пустой датой считает на сегодня (часы подменены)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 11, 20, 10, 0));
    await prepare();

    expect(screen.getByTestId("access-date")).toHaveValue("");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.getByTestId("access-inactive")).toHaveTextContent("закончилось 14.12.2026");

    setDate("2026-12-10");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");

    setDate("");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
  });

  it("смена даты не меняет сохранённую конфигурацию", async () => {
    await prepare();
    const before = localStorage.getItem(STORAGE_KEY);

    setDate("2026-12-15");
    setDate("2026-12-01");

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("не запоминает дату после перезагрузки", async () => {
    await prepare();
    setDate("2026-12-15");
    cleanup();

    renderApp();

    expect(screen.getByTestId("access-date")).toHaveValue("");
  });
});

describe("отзыв разрешения с даты: договор «Северной»", () => {
  const contractor = {
    id: "s1",
    subject: { type: "user", id: "vera" },
    serviceId: "ledger",
    startsOn: "2026-11-20",
    endsOn: "2026-12-03",
  } as const;

  const prepare = () => {
    const base = JSON.parse(exportConfig(seedConfig));
    base.permissions.push(contractor);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(base));
    renderApp();
  };

  const revokeFrom = (id: string, date: string) => {
    fireEvent.click(screen.getByTestId(`permission-revoke-open-${id}`));
    fireEvent.change(screen.getByTestId(`permission-revoke-date-${id}`), {
      target: { value: date },
    });
    fireEvent.click(screen.getByTestId(`permission-revoke-confirm-${id}`));
  };

  const savedPermission = (id: string) =>
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").permissions.find(
      (permission: { id: string }) => permission.id === id,
    );

  afterEach(() => vi.useRealTimers());

  it("отзывает разрешение: сообщение, новый срок в строке и в сохранённой конфигурации", () => {
    prepare();

    revokeFrom("s1", "2026-11-27");

    expect(screen.getByTestId("permission-message")).toHaveTextContent(
      "Разрешение отозвано с 27.11.2026",
    );
    expect(screen.getByTestId("permission-interval-s1")).toHaveTextContent(
      "с 20.11.2026 по 26.11.2026",
    );
    expect(savedPermission("s1")).toMatchObject({ startsOn: "2026-11-20", endsOn: "2026-11-26" });
  });

  it("после отзыва проверка на 26.11.2026 показывает доступ, а на 27.11.2026 отказ с причиной", async () => {
    prepare();
    await pick("Вера Лисицына", "Учёт");
    revokeFrom("s1", "2026-11-27");

    fireEvent.change(screen.getByTestId("access-date"), { target: { value: "2026-11-26" } });
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");

    fireEvent.change(screen.getByTestId("access-date"), { target: { value: "2026-11-27" } });
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.getByTestId("access-inactive")).toHaveTextContent(
      "Прямое разрешение: закончилось 26.11.2026",
    );
  });

  it("в поле даты по умолчанию сегодняшняя дата", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 27, 10, 0));
    prepare();

    fireEvent.click(screen.getByTestId("permission-revoke-open-s1"));

    expect(screen.getByTestId("permission-revoke-date-s1")).toHaveValue("2026-11-27");
  });

  it("отзывает бессрочное разрешение: в строке появляется «по 26.11.2026»", () => {
    prepare();

    revokeFrom("p3", "2026-11-27");

    expect(screen.getByTestId("permission-interval-p3")).toHaveTextContent("по 26.11.2026");
  });

  it("отказывает, если дата отзыва не позже начала", () => {
    prepare();
    const before = localStorage.getItem(STORAGE_KEY);

    revokeFrom("s1", "2026-11-20");

    expect(screen.getByTestId("permission-message")).toHaveTextContent(
      "Дата отзыва не позже даты начала, удалите разрешение",
    );
    expect(screen.getByTestId("permission-interval-s1")).toHaveTextContent(
      "с 20.11.2026 по 03.12.2026",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("отказывает, если разрешение и так закончится раньше", () => {
    prepare();
    const before = localStorage.getItem(STORAGE_KEY);

    revokeFrom("s1", "2026-12-10");

    expect(screen.getByTestId("permission-message")).toHaveTextContent(
      "Разрешение и так закончится раньше",
    );
    expect(screen.getByTestId("permission-interval-s1")).toHaveTextContent(
      "с 20.11.2026 по 03.12.2026",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("отказывает при пустой дате", () => {
    prepare();
    const before = localStorage.getItem(STORAGE_KEY);

    revokeFrom("s1", "");

    expect(screen.getByTestId("permission-message")).toHaveTextContent(
      "Дата отзыва должна быть реальной датой в формате ГГГГ-ММ-ДД",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("кнопка «Удалить» работает как прежде", () => {
    prepare();

    fireEvent.click(screen.getByTestId("permission-remove-s1"));

    expect(screen.queryByTestId("permission-item-s1")).not.toBeInTheDocument();
    expect(savedPermission("s1")).toBeUndefined();
  });
});
