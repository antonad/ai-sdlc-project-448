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
    await userEvent.setup().selectOptions(screen.getByTestId("group-filter"), "Бухгалтерия");

    expect(userNames()).toEqual(["Не выбран", "Анна Белова"]);
  });

  it("сбрасывает выбранного сотрудника, если он не входит в новую группу", async () => {
    renderApp();
    const events = userEvent.setup();
    await pick("Анна Белова", "Учёт");
    await events.selectOptions(screen.getByTestId("group-filter"), "Поддержка");

    expect(screen.getByTestId("user-select")).toHaveValue("");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Выберите сотрудника и сервис");
  });

  it("оставляет сотрудника выбранным, если он входит в новую группу", async () => {
    renderApp();
    const events = userEvent.setup();
    await pick("Анна Белова", "Учёт");
    await events.selectOptions(screen.getByTestId("group-filter"), "Бухгалтерия");

    expect(screen.getByTestId("user-select")).toHaveValue("anna");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  });

  it("при возврате к «Все группы» полный список, выбранный сотрудник остаётся", async () => {
    renderApp();
    const events = userEvent.setup();
    await events.selectOptions(screen.getByTestId("group-filter"), "Бухгалтерия");
    await events.selectOptions(screen.getByTestId("user-select"), "Анна Белова");
    await events.selectOptions(screen.getByTestId("group-filter"), "Все группы");

    expect(userNames()).toHaveLength(4);
    expect(screen.getByTestId("user-select")).toHaveValue("anna");
  });

  it("результат расчёта не зависит от выбранной группы", async () => {
    renderApp();
    const events = userEvent.setup();
    await pick("Анна Белова", "Учёт");
    const without = screen.getByTestId("access-sources").textContent;
    await events.selectOptions(screen.getByTestId("group-filter"), "Бухгалтерия");

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
    await events.selectOptions(screen.getByTestId("group-filter"), "Первая");
    expect(userNames()).toEqual(["Не выбран", "Двойной"]);
    await events.selectOptions(screen.getByTestId("group-filter"), "Вторая");
    expect(userNames()).toEqual(["Не выбран", "Двойной"]);
  });
});

describe("проверка на момент: разрешение «Северной»", () => {
  const seed = (extra: Config["permissions"]): string => {
    const base = JSON.parse(exportConfig(seedConfig));
    base.permissions.push(...extra);
    return JSON.stringify(base);
  };
  const contractor = {
    id: "s1",
    subject: { type: "user", id: "vera" },
    serviceId: "ledger",
    startsAt: "2026-12-01T09:00",
    expiresAt: "2026-12-14T18:00",
  } as const;

  const setMoment = (value: string) =>
    fireEvent.change(screen.getByTestId("evaluation-time"), { target: { value } });

  const prepare = async (extra: Config["permissions"] = [contractor]) => {
    localStorage.setItem(STORAGE_KEY, seed(extra));
    renderApp();
    await pick("Вера Лисицына", "Учёт");
  };

  const sourceCount = () => within(screen.getByTestId("access-sources")).getAllByRole("listitem");

  afterEach(() => vi.useRealTimers());

  it("по умолчанию в поле текущая минута браузера", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 11, 20, 10, 7, 45));
    renderApp();

    expect(screen.getByTestId("evaluation-time")).toHaveValue("2026-12-20T10:07");
  });

  it("показывает доступ внутри интервала и источник", async () => {
    await prepare();

    setMoment("2026-12-10T12:00");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
  });

  it("начало включительно: в момент начала доступ есть, за минуту до отказ", async () => {
    await prepare();

    setMoment("2026-12-01T09:00");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");

    setMoment("2026-12-01T08:59");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-inactive")).toHaveTextContent(
      "Прямое разрешение: ещё не началось, с 01.12.2026 09:00",
    );
  });

  it("окончание исключительно: за минуту до него доступ есть, в сам момент отказ", async () => {
    await prepare();

    setMoment("2026-12-14T17:59");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");

    setMoment("2026-12-14T18:00");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-inactive")).toHaveTextContent(
      "Прямое разрешение: закончилось 14.12.2026 18:00",
    );
  });

  it("смена момента пересчитывает результат без перезагрузки", async () => {
    await prepare();

    setMoment("2026-12-10T12:00");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    setMoment("2026-12-20T12:00");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    setMoment("2026-12-02T12:00");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  });

  it("называет группу в причине для группового разрешения", async () => {
    await prepare([{ ...contractor, subject: { type: "group", id: "development" } }]);

    setMoment("2026-12-15T12:00");

    expect(screen.getByTestId("access-inactive")).toHaveTextContent(
      "Группа «Разработка»: закончилось 14.12.2026 18:00",
    );
  });

  it("групповое временное разрешение даёт доступ внутри интервала, источник — группа", async () => {
    await prepare([{ ...contractor, subject: { type: "group", id: "development" } }]);

    setMoment("2026-12-10T12:00");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Разработка»");
  });

  it("при наличии доступа не показывает недействующие разрешения", async () => {
    await prepare([
      contractor,
      { id: "s2", subject: { type: "user", id: "vera" }, serviceId: "ledger" },
    ]);

    setMoment("2026-12-15T12:00");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.queryByTestId("access-inactive")).not.toBeInTheDocument();
  });

  it("постоянное и временное разрешения на один сервис: внутри два источника, после окончания один", async () => {
    await prepare([
      contractor,
      { id: "s2", subject: { type: "user", id: "vera" }, serviceId: "ledger" },
    ]);

    setMoment("2026-12-10T12:00");
    expect(sourceCount()).toHaveLength(2);

    setMoment("2026-12-14T18:00");
    expect(sourceCount()).toHaveLength(1);
  });

  it("выдача временного разрешения рядом с постоянным: «Разрешение выдано», а не «уже выдано»", async () => {
    renderApp();
    const events = userEvent.setup();
    await pick("Анна Белова", "Учёт");
    await events.selectOptions(screen.getByTestId("permission-subject-select"), "Анна Белова");
    await events.selectOptions(screen.getByTestId("permission-service-select"), "Учёт");
    fireEvent.change(screen.getByTestId("permission-starts-at"), {
      target: { value: "2026-12-01T09:00" },
    });
    fireEvent.change(screen.getByTestId("permission-expires-at"), {
      target: { value: "2026-12-14T18:00" },
    });
    fireEvent.click(screen.getByTestId("permission-add"));

    expect(screen.getByTestId("permission-message")).toHaveTextContent("Разрешение выдано");
    expect(screen.getByTestId("permission-message")).not.toHaveTextContent("уже выдано");

    setMoment("2026-12-10T12:00");
    expect(sourceCount()).toHaveLength(3);
    setMoment("2026-12-14T18:00");
    expect(sourceCount()).toHaveLength(2);
  });

  it("пустое поле считает на «сейчас» (часы подменены)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 11, 20, 10, 0));
    await prepare();

    expect(screen.getByTestId("evaluation-time")).toHaveValue("2026-12-20T10:00");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.getByTestId("access-inactive")).toHaveTextContent("закончилось 14.12.2026 18:00");

    setMoment("2026-12-10T12:00");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");

    setMoment("");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
  });

  it("смена момента не меняет сохранённую конфигурацию", async () => {
    await prepare();
    const before = localStorage.getItem(STORAGE_KEY);

    setMoment("2026-12-15T12:00");
    setMoment("2026-12-01T09:00");

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("не запоминает момент после перезагрузки: снова текущее время", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 11, 20, 10, 0));
    await prepare();
    setMoment("2026-12-15T12:00");
    cleanup();

    renderApp();

    expect(screen.getByTestId("evaluation-time")).toHaveValue("2026-12-20T10:00");
  });

  it("импорт файла прежнего формата без интервалов заменяет конфигурацию, доступ как раньше", async () => {
    renderApp();
    const legacy = { version: 2, ...seedConfig };
    const file = new File([JSON.stringify(legacy)], "config.json", { type: "application/json" });
    await userEvent.setup().upload(screen.getByTestId("import-input"), file);

    expect(await screen.findByTestId("import-status")).toHaveTextContent("Конфигурация заменена");
    await pick("Борис Каримов", "Репозиторий");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
  });
});

describe("отзыв разрешения с момента: договор «Северной»", () => {
  const contractor = {
    id: "s1",
    subject: { type: "user", id: "vera" },
    serviceId: "ledger",
    startsAt: "2026-11-20T09:00",
    expiresAt: "2026-12-03T18:00",
  } as const;

  const prepare = (extra: object[] = [contractor]) => {
    const base = JSON.parse(exportConfig(seedConfig));
    base.permissions.push(...extra);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(base));
    renderApp();
  };

  const setField = (testId: string, value: string) =>
    fireEvent.change(screen.getByTestId(testId), { target: { value } });

  const revokeFrom = (id: string, moment: string) => {
    setField("permission-revoked-at", moment);
    fireEvent.click(screen.getByTestId(`permission-revoke-${id}`));
  };

  const savedPermission = (id: string) =>
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").permissions.find(
      (permission: { id: string }) => permission.id === id,
    );

  afterEach(() => vi.useRealTimers());

  it("кнопка отзыва есть у разрешения с интервалом и нет у постоянного", () => {
    prepare();

    expect(screen.getByTestId("permission-revoke-s1")).toBeInTheDocument();
    expect(screen.queryByTestId("permission-revoke-p3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("permission-revoke-open-s1")).not.toBeInTheDocument();
  });

  it("отзывает разрешение: сообщение, строка остаётся, срок прежний, отзыв сохранён", () => {
    prepare();

    revokeFrom("s1", "2026-11-27T12:00");

    expect(screen.getByTestId("permission-message")).toHaveTextContent("Разрешение отозвано");
    expect(screen.getByTestId("permission-item-s1")).toBeInTheDocument();
    expect(screen.getByTestId("permission-revoked-s1")).toHaveTextContent(
      ", отозвано с 27.11.2026 12:00",
    );
    expect(screen.getByTestId("permission-interval-s1")).toHaveTextContent(
      "с 20.11.2026 09:00 до 03.12.2026 18:00",
    );
    expect(screen.queryByTestId("permission-revoke-s1")).not.toBeInTheDocument();
    expect(savedPermission("s1")).toMatchObject({
      startsAt: "2026-11-20T09:00",
      expiresAt: "2026-12-03T18:00",
      revokedAt: "2026-11-27T12:00",
    });
  });

  it("пустое поле берёт момент проверки с экрана", () => {
    prepare();
    setField("evaluation-time", "2026-11-27T12:00");

    fireEvent.click(screen.getByTestId("permission-revoke-s1"));

    expect(screen.getByTestId("permission-revoked-s1")).toHaveTextContent(
      ", отозвано с 27.11.2026 12:00",
    );
    expect(savedPermission("s1")).toMatchObject({ revokedAt: "2026-11-27T12:00" });
  });

  it("если и момент проверки пуст, берёт текущую минуту", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 27, 10, 5, 30));
    prepare();
    setField("evaluation-time", "");

    fireEvent.click(screen.getByTestId("permission-revoke-s1"));

    expect(screen.getByTestId("permission-revoked-s1")).toHaveTextContent(
      ", отозвано с 27.11.2026 10:05",
    );
  });

  it("поле момента отзыва по умолчанию пусто", () => {
    prepare();

    expect(screen.getByTestId("permission-revoked-at")).toHaveValue("");
  });

  it("до момента отзыва доступ есть, с момента нет, причина в access-inactive", async () => {
    prepare();
    await pick("Вера Лисицына", "Учёт");
    revokeFrom("s1", "2026-11-27T12:00");

    setField("evaluation-time", "2026-11-27T11:59");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");

    setField("evaluation-time", "2026-11-27T12:00");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.getByTestId("access-inactive")).toHaveTextContent(
      "Прямое разрешение: отозвано 27.11.2026 12:00",
    );
  });

  it("после отзыва доступа нет, даже если интервал ещё не кончился", async () => {
    prepare();
    await pick("Вера Лисицына", "Учёт");
    revokeFrom("s1", "2026-11-27T12:00");

    setField("evaluation-time", "2026-12-01T12:00");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
  });

  it("отзыв прямого временного не убирает доступ по группе", async () => {
    prepare([{ ...contractor, serviceId: "repository" }]);
    await pick("Вера Лисицына", "Репозиторий");
    revokeFrom("s1", "2026-11-27T12:00");

    setField("evaluation-time", "2026-12-01T12:00");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Разработка»");
    expect(screen.getByTestId("access-sources")).not.toHaveTextContent("Прямое разрешение");
  });

  it("отзыв одного из двух прямых временных оставляет второе", async () => {
    prepare([
      contractor,
      {
        id: "s2",
        subject: { type: "user", id: "vera" },
        serviceId: "ledger",
        startsAt: "2026-11-25T09:00",
        expiresAt: "2026-12-10T18:00",
      },
    ]);
    await pick("Вера Лисицына", "Учёт");
    revokeFrom("s1", "2026-11-27T12:00");

    setField("evaluation-time", "2026-12-01T12:00");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Прямое разрешение");
    expect(screen.getByTestId("permission-revoke-s2")).toBeInTheDocument();
  });

  it("групповое временное разрешение: до отзыва доступ по группе, после нет", async () => {
    prepare([{ ...contractor, subject: { type: "group", id: "development" } }]);
    await pick("Вера Лисицына", "Учёт");
    revokeFrom("s1", "2026-11-27T12:00");

    setField("evaluation-time", "2026-11-27T11:59");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Разработка»");

    setField("evaluation-time", "2026-11-27T12:00");
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.queryByTestId("access-sources")).not.toBeInTheDocument();
  });

  it("отказывает, если момент отзыва не позже начала", () => {
    prepare();
    const before = localStorage.getItem(STORAGE_KEY);

    revokeFrom("s1", "2026-11-20T09:00");

    expect(screen.getByTestId("permission-message")).toHaveTextContent(
      "Момент отзыва не позже начала, удалите разрешение",
    );
    expect(screen.queryByTestId("permission-revoked-s1")).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("отказывает, если разрешение и так закончится раньше", () => {
    prepare();
    const before = localStorage.getItem(STORAGE_KEY);

    revokeFrom("s1", "2026-12-10T12:00");

    expect(screen.getByTestId("permission-message")).toHaveTextContent(
      "Разрешение и так закончится раньше",
    );
    expect(screen.getByTestId("permission-interval-s1")).toHaveTextContent(
      "с 20.11.2026 09:00 до 03.12.2026 18:00",
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("кнопка «Удалить» работает как прежде", () => {
    prepare();

    fireEvent.click(screen.getByTestId("permission-remove-s1"));

    expect(screen.queryByTestId("permission-item-s1")).not.toBeInTheDocument();
    expect(savedPermission("s1")).toBeUndefined();
  });

  it("удаляет и отозванное разрешение", () => {
    prepare();
    revokeFrom("s1", "2026-11-27T12:00");

    fireEvent.click(screen.getByTestId("permission-remove-s1"));

    expect(screen.queryByTestId("permission-item-s1")).not.toBeInTheDocument();
  });

  it("импорт файла прежнего формата без revokedAt: конфигурация заменена, кнопок отзыва нет", async () => {
    prepare();
    const legacy = { version: 2, ...seedConfig };
    const file = new File([JSON.stringify(legacy)], "config.json", { type: "application/json" });
    await userEvent.setup().upload(screen.getByTestId("import-input"), file);

    expect(await screen.findByTestId("import-status")).toHaveTextContent("Конфигурация заменена");
    expect(screen.queryAllByTestId(/^permission-revoke-/)).toHaveLength(0);
  });
});
