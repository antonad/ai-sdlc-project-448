import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { exportConfig } from "../app/config-file";
import { seedConfig } from "../app/seed";
import { STORAGE_KEY } from "../app/storage";
import { App } from "./App";

const renderApp = () =>
  render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );

const pickAccess = async (user: string, service: string) => {
  const events = userEvent.setup();
  await events.selectOptions(screen.getByTestId("user-select"), user);
  await events.selectOptions(screen.getByTestId("service-select"), service);
};

const upload = async (text: string) => {
  const file = new File([text], "config.json", { type: "application/json" });
  await userEvent.setup().upload(screen.getByTestId("import-input"), file);
};

describe("редактирование разрешений", () => {
  it("показывает все разрешения конфигурации", () => {
    renderApp();

    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(seedConfig.permissions.length);
    expect(screen.getByTestId("permission-item-p3")).toHaveTextContent("Борис Каримов");
    expect(screen.getByTestId("permission-item-p3")).toHaveTextContent("Репозиторий");
  });

  it("добавляет разрешение, и расчёт сразу его учитывает", async () => {
    renderApp();
    const events = userEvent.setup();
    await events.selectOptions(screen.getByTestId("permission-subject-select"), "Вера Лисицына");
    await events.selectOptions(screen.getByTestId("permission-service-select"), "Учёт");
    await events.click(screen.getByTestId("permission-add"));
    await pickAccess("Вера Лисицына", "Учёт");

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
  });

  it("сообщает о выдаче и добавляет строку в список", async () => {
    renderApp();
    const events = userEvent.setup();
    await events.selectOptions(screen.getByTestId("permission-subject-select"), "Вера Лисицына");
    await events.selectOptions(screen.getByTestId("permission-service-select"), "Учёт");
    await events.click(screen.getByTestId("permission-add"));

    expect(screen.getByTestId("permission-message")).toHaveTextContent("Разрешение выдано");
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(
      seedConfig.permissions.length + 1,
    );
  });

  it("сообщает о повторной выдаче и не создаёт дубль", async () => {
    renderApp();
    const events = userEvent.setup();
    await events.selectOptions(screen.getByTestId("permission-subject-select"), "Анна Белова");
    await events.selectOptions(screen.getByTestId("permission-service-select"), "Учёт");
    await events.click(screen.getByTestId("permission-add"));

    expect(screen.getByTestId("permission-message")).toHaveTextContent("уже выдано");
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(seedConfig.permissions.length);
  });

  it("отзыв одного разрешения сохраняет независимый источник доступа", async () => {
    renderApp();
    await userEvent.setup().click(screen.getByTestId("permission-remove-p1"));
    await pickAccess("Анна Белова", "Учёт");

    expect(screen.queryByTestId("permission-item-p1")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступ есть");
    expect(screen.getByTestId("access-sources")).toHaveTextContent("Группа «Бухгалтерия»");
    expect(screen.getByTestId("access-sources")).not.toHaveTextContent("Прямое разрешение");
  });

  it("изменения переживают перезагрузку страницы", async () => {
    const first = renderApp();
    await userEvent.setup().click(screen.getByTestId("permission-remove-p3"));
    first.unmount();
    renderApp();

    expect(screen.queryByTestId("permission-item-p3")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(4);
  });
});

describe("импорт конфигурации", () => {
  const imported = {
    ...seedConfig,
    permissions: [seedConfig.permissions[4]],
  };

  it("заменяет конфигурацию целиком и сохраняет её в браузере", async () => {
    renderApp();
    await upload(exportConfig(imported));
    expect(await screen.findByTestId("import-status")).toHaveTextContent("Конфигурация заменена");

    const items = screen.getAllByTestId(/^permission-item-/);
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByText(/Поддержка/)).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(exportConfig(imported));
  });

  it("отвергает некорректный файл, показывает причину и не меняет конфигурацию", async () => {
    renderApp();
    const broken = JSON.parse(exportConfig(seedConfig));
    broken.permissions[0].serviceId = "vault";
    await upload(JSON.stringify(broken));

    expect(await screen.findByTestId("import-error")).toHaveTextContent(
      "permissions[0]: нет сервиса «vault»",
    );
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(seedConfig.permissions.length);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("отвергает файл с несуществующим моментом и оставляет данные прежними", async () => {
    const saved = { ...seedConfig, permissions: seedConfig.permissions.slice(0, 4) };
    localStorage.setItem(STORAGE_KEY, exportConfig(saved));
    renderApp();
    const broken = JSON.parse(exportConfig(seedConfig));
    broken.permissions[0].expiresAt = "2026-02-30T10:00";
    await upload(JSON.stringify(broken));

    const alert = await screen.findByTestId("import-error");
    expect(alert).toHaveTextContent("Файл не принят, конфигурация осталась прежней");
    expect(alert).toHaveTextContent("permissions[0].expiresAt");
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(4);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(exportConfig(saved));
  });

  it("при ошибке оставляет прежними разрешения и ранее сохранённую копию", async () => {
    const saved = { ...seedConfig, permissions: seedConfig.permissions.slice(0, 4) };
    localStorage.setItem(STORAGE_KEY, exportConfig(saved));
    renderApp();
    const broken = JSON.parse(exportConfig(seedConfig));
    broken.permissions[0].subject.id = "nobody";
    await upload(JSON.stringify(broken));

    const alert = await screen.findByTestId("import-error");
    expect(alert).toHaveTextContent("Файл не принят, конфигурация осталась прежней");
    expect(alert).toHaveTextContent("permissions[0]: нет пользователя «nobody»");
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(4);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(exportConfig(saved));
  });

  it("показывает списком все ошибки файла", async () => {
    renderApp();
    const broken = JSON.parse(exportConfig(seedConfig));
    broken.permissions[0].serviceId = "vault";
    broken.permissions[1].subject.id = "ghosts";
    await upload(JSON.stringify(broken));

    const alert = await screen.findByTestId("import-error");
    expect(within(alert).getAllByRole("listitem")).toHaveLength(2);
    expect(alert).toHaveTextContent("permissions[0]: нет сервиса «vault»");
    expect(alert).toHaveTextContent("permissions[1]: нет группы «ghosts»");
  });

  it("после ошибки следующий корректный файл принимается и сообщение об ошибке уходит", async () => {
    renderApp();
    await upload("{oops");
    await screen.findByTestId("import-error");
    await upload(exportConfig(imported));

    await screen.findByTestId("import-status");
    expect(screen.queryByTestId("import-error")).not.toBeInTheDocument();
  });
});

describe("экспорт конфигурации", () => {
  it("отдаёт текущую конфигурацию для скачивания в формате файла импорта", async () => {
    renderApp();
    await userEvent.setup().click(screen.getByTestId("permission-remove-p5"));

    const href = screen.getByTestId("export-link").getAttribute("href") ?? "";
    const expected = {
      ...seedConfig,
      permissions: seedConfig.permissions.slice(0, 4),
    };
    expect(decodeURIComponent(href)).toBe(
      `data:application/json;charset=utf-8,${exportConfig(expected)}`,
    );
    expect(screen.getByTestId("export-link")).toHaveAttribute(
      "download",
      "access-policy-config.json",
    );
  });
});

describe("разрешения со сроком", () => {
  const grant = async (
    starts: string,
    ends: string,
    subject = "Вера Лисицына",
    service = "Учёт",
  ) => {
    const events = userEvent.setup();
    await events.selectOptions(screen.getByTestId("permission-subject-select"), subject);
    await events.selectOptions(screen.getByTestId("permission-service-select"), service);
    fireEvent.change(screen.getByTestId("permission-starts-at"), { target: { value: starts } });
    fireEvent.change(screen.getByTestId("permission-expires-at"), { target: { value: ends } });
    await events.click(screen.getByTestId("permission-add"));
  };

  const rows = () => screen.getAllByTestId(/^permission-item-/);
  const message = () => screen.getByTestId("permission-message");

  it("пишет «бессрочно» у постоянного разрешения", () => {
    renderApp();

    expect(screen.getByTestId("permission-interval-p1")).toHaveTextContent("бессрочно");
  });

  it("выдаёт разрешение с интервалом и показывает срок в строке списка", async () => {
    renderApp();
    await grant("2026-12-01T09:00", "2026-12-14T18:00");

    expect(message()).toHaveTextContent("Разрешение выдано");
    expect(rows()).toHaveLength(seedConfig.permissions.length + 1);
    expect(screen.getByTestId("permission-interval-p6")).toHaveTextContent(
      "с 01.12.2026 09:00 до 14.12.2026 18:00",
    );
  });

  it("показывает срок с одной границей", async () => {
    renderApp();
    await grant("2026-12-01T09:00", "");
    await grant("", "2026-12-14T18:00", "Вера Лисицына", "Почта");

    expect(screen.getByTestId("permission-interval-p6")).toHaveTextContent("с 01.12.2026 09:00");
    expect(screen.getByTestId("permission-interval-p6")).not.toHaveTextContent("до");
    expect(screen.getByTestId("permission-interval-p7")).toHaveTextContent("до 14.12.2026 18:00");
    expect(screen.getByTestId("permission-interval-p7")).not.toHaveTextContent("с ");
  });

  it("оба поля пусты: выдаёт постоянное разрешение «бессрочно»", async () => {
    renderApp();
    await grant("", "");

    expect(message()).toHaveTextContent("Разрешение выдано");
    expect(screen.getByTestId("permission-interval-p6")).toHaveTextContent("бессрочно");
  });

  it("выдаёт интервал внутри одного дня", async () => {
    renderApp();
    await grant("2026-12-10T09:00", "2026-12-10T10:30");

    expect(message()).toHaveTextContent("Разрешение выдано");
    expect(screen.getByTestId("permission-interval-p6")).toHaveTextContent(
      "с 10.12.2026 09:00 до 10.12.2026 10:30",
    );
  });

  it("отвергает окончание раньше начала: список и localStorage не меняются", async () => {
    renderApp();
    await grant("2026-12-14T18:00", "2026-12-01T09:00");

    expect(message()).toHaveTextContent("Окончание должно быть позже начала");
    expect(rows()).toHaveLength(seedConfig.permissions.length);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("отвергает окончание, равное началу", async () => {
    renderApp();
    await grant("2026-12-10T09:00", "2026-12-10T09:00");

    expect(message()).toHaveTextContent("Окончание должно быть позже начала");
    expect(rows()).toHaveLength(seedConfig.permissions.length);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("повторная выдача с теми же моментами сообщает «уже выдано»", async () => {
    renderApp();
    await grant("2026-12-01T09:00", "2026-12-14T18:00");
    await grant("2026-12-01T09:00", "2026-12-14T18:00");

    expect(message()).toHaveTextContent("Это разрешение уже выдано");
    expect(rows()).toHaveLength(seedConfig.permissions.length + 1);
  });

  it("постоянное разрешение рядом с временным не считается дублем", async () => {
    renderApp();
    await grant("2026-12-01T09:00", "2026-12-14T18:00");
    await grant("", "");

    expect(message()).toHaveTextContent("Разрешение выдано");
    expect(message()).not.toHaveTextContent("уже выдано");
    expect(rows()).toHaveLength(seedConfig.permissions.length + 2);
  });

  it("другой интервал на тот же сервис даёт новую строку с новым идентификатором", async () => {
    renderApp();
    await grant("2026-12-01T09:00", "2026-12-14T18:00");
    await grant("2026-12-10T09:00", "2026-12-20T18:00");

    expect(message()).toHaveTextContent("Разрешение выдано");
    expect(rows()).toHaveLength(seedConfig.permissions.length + 2);
    expect(screen.getByTestId("permission-item-p6")).toBeInTheDocument();
    expect(screen.getByTestId("permission-item-p7")).toBeInTheDocument();
  });

  it("удаляет разрешение со сроком, не трогая остальные", async () => {
    renderApp();
    await grant("2026-12-01T09:00", "2026-12-14T18:00");
    await userEvent.setup().click(screen.getByTestId("permission-remove-p6"));

    expect(screen.queryByTestId("permission-item-p6")).not.toBeInTheDocument();
    expect(rows()).toHaveLength(seedConfig.permissions.length);
  });
});

describe("отзыв разрешения с момента", () => {
  const openRevoke = async (id: string) => {
    await userEvent.setup().click(screen.getByTestId(`permission-revoke-open-${id}`));
  };
  const revoke = async (id: string, moment: string) => {
    await openRevoke(id);
    fireEvent.change(screen.getByTestId(`permission-revoke-date-${id}`), {
      target: { value: moment },
    });
    await userEvent.setup().click(screen.getByTestId(`permission-revoke-confirm-${id}`));
  };
  const grantTerm = async (starts: string, ends: string) => {
    const events = userEvent.setup();
    await events.selectOptions(screen.getByTestId("permission-subject-select"), "Вера Лисицына");
    await events.selectOptions(screen.getByTestId("permission-service-select"), "Учёт");
    fireEvent.change(screen.getByTestId("permission-starts-at"), { target: { value: starts } });
    fireEvent.change(screen.getByTestId("permission-expires-at"), { target: { value: ends } });
    await events.click(screen.getByTestId("permission-add"));
  };
  const message = () => screen.getByTestId("permission-message");

  it("поле отзыва появляется по кнопке и по умолчанию содержит текущий момент", async () => {
    renderApp();
    expect(screen.queryByTestId("permission-revoke-date-p3")).not.toBeInTheDocument();

    await openRevoke("p3");

    const field = screen.getByTestId("permission-revoke-date-p3") as HTMLInputElement;
    expect(field.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("отзывает бессрочное разрешение: сообщает момент и показывает «до …»", async () => {
    renderApp();
    await revoke("p3", "2026-11-27T12:00");

    expect(message()).toHaveTextContent("Разрешение отозвано с 27.11.2026 12:00");
    expect(screen.getByTestId("permission-interval-p3")).toHaveTextContent("до 27.11.2026 12:00");
    expect(screen.queryByTestId("permission-revoke-date-p3")).not.toBeInTheDocument();
  });

  it("отзыв сокращает срок, остальные строки не меняются", async () => {
    renderApp();
    await grantTerm("2026-11-20T09:00", "2026-12-03T18:00");
    await revoke("p6", "2026-11-27T12:00");

    expect(screen.getByTestId("permission-interval-p6")).toHaveTextContent(
      "с 20.11.2026 09:00 до 27.11.2026 12:00",
    );
    expect(screen.getByTestId("permission-interval-p1")).toHaveTextContent("бессрочно");
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(
      seedConfig.permissions.length + 1,
    );
  });

  it("сохраняет отзыв в браузере", async () => {
    const first = renderApp();
    await revoke("p3", "2026-11-27T12:00");
    first.unmount();
    renderApp();

    expect(screen.getByTestId("permission-interval-p3")).toHaveTextContent("до 27.11.2026 12:00");
  });

  it("отказывает, если момент не позже начала: срок не меняется, поле остаётся открытым", async () => {
    renderApp();
    await grantTerm("2026-11-20T09:00", "2026-12-03T18:00");
    await revoke("p6", "2026-11-20T09:00");

    expect(message()).toHaveTextContent("Момент отзыва не позже начала, удалите разрешение");
    expect(screen.getByTestId("permission-interval-p6")).toHaveTextContent(
      "с 20.11.2026 09:00 до 03.12.2026 18:00",
    );
    expect(screen.getByTestId("permission-revoke-date-p6")).toBeInTheDocument();
  });

  it("отказывает, если разрешение и так закончится раньше, в том числе ровно в момент отзыва", async () => {
    renderApp();
    await grantTerm("2026-11-20T09:00", "2026-12-03T18:00");
    await revoke("p6", "2026-12-03T18:00");

    expect(message()).toHaveTextContent("Разрешение и так закончится раньше");
    expect(screen.getByTestId("permission-interval-p6")).toHaveTextContent(
      "с 20.11.2026 09:00 до 03.12.2026 18:00",
    );
  });

  it("отказывает при пустом моменте и не меняет разрешение", async () => {
    renderApp();
    await revoke("p3", "");

    expect(message()).toHaveTextContent(
      "Момент отзыва должен быть реальным моментом в формате ГГГГ-ММ-ДДTчч:мм",
    );
    expect(screen.getByTestId("permission-interval-p3")).toHaveTextContent("бессрочно");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
