import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
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

const upload = async (text: string) => {
  const file = new File([text], "config.json", { type: "application/json" });
  await userEvent.setup().upload(screen.getByTestId("import-input"), file);
};

const click = (testId: string) => userEvent.setup().click(screen.getByTestId(testId));

const pickAccess = async (user: string, service: string) => {
  const events = userEvent.setup();
  await events.selectOptions(screen.getByTestId("user-select"), user);
  await events.selectOptions(screen.getByTestId("service-select"), service);
};

const grant = async (subject: string, service: string, starts = "", ends = "") => {
  const events = userEvent.setup();
  await events.selectOptions(screen.getByTestId("permission-subject-select"), subject);
  await events.selectOptions(screen.getByTestId("permission-service-select"), service);
  fireEvent.change(screen.getByTestId("permission-starts-at"), { target: { value: starts } });
  fireEvent.change(screen.getByTestId("permission-expires-at"), { target: { value: ends } });
  await click("permission-add");
};

const revokeAt = async (id: string, moment: string) => {
  fireEvent.change(screen.getByTestId("permission-revoked-at"), { target: { value: moment } });
  await click(`permission-revoke-${id}`);
};

const storageSnapshot = () =>
  JSON.stringify(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]));

const exportedFile = () =>
  decodeURIComponent(screen.getByTestId("export-link").getAttribute("href") ?? "");

const previewRows = () =>
  screen
    .queryAllByTestId(/^import-preview-/)
    .map((row) => row.getAttribute("data-testid"))
    .sort();

describe("предпросмотр импорта", () => {
  it("выбор файла открывает предпросмотр с кнопками и без статуса", async () => {
    renderApp();
    await upload(exportConfig(seedConfig));

    expect(await screen.findByTestId("import-preview")).toBeInTheDocument();
    expect(screen.getByTestId("import-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("import-cancel")).toBeInTheDocument();
    expect(screen.queryByTestId("import-status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("import-error")).not.toBeInTheDocument();
  });

  it("называет выданное, убранное и изменённое, и подтверждение делает конфигурацию равной файлу", async () => {
    renderApp();
    const before = exportedFile();
    expect(before).toContain(exportConfig(seedConfig));
    const file = {
      ...seedConfig,
      permissions: seedConfig.permissions.map((permission) =>
        permission.id === "p3" ? { ...permission, serviceId: "mail" } : permission,
      ),
    };
    await grant("Вера Лисицына", "Учёт");
    await click("permission-remove-p5");
    await upload(exportConfig(file));
    await screen.findByTestId("import-preview");

    expect(previewRows()).toEqual([
      "import-preview-added-p5",
      "import-preview-changed-p3",
      "import-preview-removed-p6",
    ]);

    await click("import-confirm");
    expect(localStorage.getItem(STORAGE_KEY)).toBe(exportConfig(file));
    expect(exportedFile()).toContain(exportConfig(file));
  });

  it("файл, равный текущей конфигурации, показывает только пустой предпросмотр", async () => {
    renderApp();
    await upload(exportConfig(seedConfig));

    const preview = await screen.findByTestId("import-preview");
    expect(screen.getByTestId("import-preview-empty")).toBeInTheDocument();
    expect(previewRows()).toEqual(["import-preview-empty"]);
    expect(preview).not.toHaveTextContent("Появится");
  });

  it("пока предпросмотр открыт, расчёт, экспорт и localStorage не меняются", async () => {
    renderApp();
    await grant("Вера Лисицына", "Учёт");
    await pickAccess("Анна Белова", "Учёт");
    const answer = screen.getByTestId("access-result").textContent;
    const stored = storageSnapshot();
    const exported = exportedFile();
    await upload(exportConfig({ ...seedConfig, permissions: [seedConfig.permissions[4]] }));
    await screen.findByTestId("import-preview");

    expect(screen.getByTestId("access-result").textContent).toBe(answer);
    expect(exportedFile()).toBe(exported);
    expect(storageSnapshot()).toBe(stored);
    expect(screen.getAllByTestId(/^permission-item-/)).toHaveLength(6);
  });

  it("после перезагрузки предпросмотра нет, расчёт прежний", async () => {
    const first = renderApp();
    await pickAccess("Анна Белова", "Учёт");
    const answer = screen.getByTestId("access-result").textContent;
    await upload(exportConfig({ ...seedConfig, permissions: [] }));
    await screen.findByTestId("import-preview");
    first.unmount();
    renderApp();
    await pickAccess("Анна Белова", "Учёт");

    expect(screen.queryByTestId("import-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-result").textContent).toBe(answer);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("подтверждение показывает статус, прячет предпросмотр и применяет файл", async () => {
    renderApp();
    await upload(exportConfig({ ...seedConfig, permissions: [] }));
    await screen.findByTestId("import-preview");
    await click("import-confirm");
    await pickAccess("Анна Белова", "Учёт");

    expect(screen.getByTestId("import-status")).toHaveTextContent("Конфигурация заменена");
    expect(screen.queryByTestId("import-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
  });

  it("статус после подтверждения пропадает при выборе следующего файла", async () => {
    renderApp();
    await upload(exportConfig({ ...seedConfig, permissions: [] }));
    await click("import-confirm");
    expect(await screen.findByTestId("import-status")).toBeInTheDocument();
    await upload(exportConfig(seedConfig));
    await screen.findByTestId("import-preview");
    expect(screen.queryByTestId("import-status")).not.toBeInTheDocument();

    await click("import-cancel");
    await upload("{oops");
    await screen.findByTestId("import-error");
    expect(screen.queryByTestId("import-status")).not.toBeInTheDocument();
  });

  it("отмена прячет предпросмотр и статус и ничего не меняет", async () => {
    renderApp();
    await grant("Вера Лисицына", "Учёт");
    await pickAccess("Вера Лисицына", "Учёт");
    const answer = screen.getByTestId("access-result").textContent;
    const stored = storageSnapshot();
    const exported = exportedFile();
    await upload(exportConfig({ ...seedConfig, permissions: [] }));
    await screen.findByTestId("import-preview");
    await click("import-cancel");

    expect(screen.queryByTestId("import-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("import-status")).not.toBeInTheDocument();
    expect(screen.getByTestId("access-result").textContent).toBe(answer);
    expect(exportedFile()).toBe(exported);
    expect(storageSnapshot()).toBe(stored);
  });

  it("файл с ошибкой даёт ошибку без предпросмотра и закрывает открытый предпросмотр", async () => {
    renderApp();
    await upload(exportConfig(seedConfig));
    await screen.findByTestId("import-preview");
    await upload("{oops");

    expect(await screen.findByTestId("import-error")).toBeInTheDocument();
    expect(screen.queryByTestId("import-preview")).not.toBeInTheDocument();

    await upload(exportConfig(seedConfig));
    expect(await screen.findByTestId("import-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("import-error")).not.toBeInTheDocument();
  });

  it("новый файл заменяет предпросмотр прежнего", async () => {
    renderApp();
    await upload(exportConfig({ ...seedConfig, permissions: [] }));
    await screen.findByTestId("import-preview-removed-p1");
    await upload(exportConfig(seedConfig));

    await screen.findByTestId("import-preview-empty");
    expect(screen.queryByTestId("import-preview-removed-p1")).not.toBeInTheDocument();
  });

  it("различия пользователей и сервисов показаны отдельно и не считаются разрешениями", async () => {
    renderApp();
    await upload(
      exportConfig({
        ...seedConfig,
        users: [...seedConfig.users, { id: "new", name: "Новый", groupIds: [] }],
      }),
    );

    expect(await screen.findByTestId("import-entities")).toHaveTextContent(
      "Пользователи: добавлено 1, убрано 0, изменено 0",
    );
    expect(screen.queryByTestId("import-preview-empty")).not.toBeInTheDocument();
    expect(previewRows()).toEqual([]);
  });
});

describe("предпросмотр и отзывы", () => {
  const prepare = async () => {
    await grant("Анна Белова", "Репозиторий", "2026-11-20T09:00", "2026-12-03T18:00");
    return localStorage.getItem(STORAGE_KEY) ?? "";
  };
  const checkAfterRevocation = async () => {
    await pickAccess("Анна Белова", "Репозиторий");
    fireEvent.change(screen.getByTestId("evaluation-time"), {
      target: { value: "2026-11-28T10:00" },
    });
  };

  it("показывает сохраняемый отзыв строкой kept и больше ничем", async () => {
    renderApp();
    const before = await prepare();
    await revokeAt("p6", "2026-11-27T12:00");
    await upload(before);
    await screen.findByTestId("import-preview");

    expect(previewRows()).toEqual(["import-preview-kept-p6"]);
    expect(screen.getByTestId("import-preview-kept-p6")).toHaveTextContent("отозвано с");
  });

  it("отзыв после экспорта остаётся в силе после подтверждения", async () => {
    renderApp();
    const before = await prepare();
    await revokeAt("p6", "2026-11-27T12:00");
    await upload(before);
    await click("import-confirm");
    await checkAfterRevocation();

    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
    expect(screen.getByTestId("permission-revoked-p6")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").permissions[5].revokedAt).toBe(
      "2026-11-27T07:00Z",
    );
  });

  it("отзыв, сделанный при открытом предпросмотре, тоже сохраняется", async () => {
    renderApp();
    const before = await prepare();
    await upload(before);
    await screen.findByTestId("import-preview-empty");
    await revokeAt("p6", "2026-11-27T12:00");

    expect(await screen.findByTestId("import-preview-kept-p6")).toBeInTheDocument();
    expect(screen.queryByTestId("import-preview-empty")).not.toBeInTheDocument();
    await click("import-confirm");
    await checkAfterRevocation();
    expect(screen.getByTestId("access-result")).toHaveTextContent("Доступа нет");
  });

  it("отмена оставляет отзыв и текущую конфигурацию", async () => {
    renderApp();
    const before = await prepare();
    await revokeAt("p6", "2026-11-27T12:00");
    const stored = storageSnapshot();
    await upload(before);
    await click("import-cancel");

    expect(storageSnapshot()).toBe(stored);
    expect(screen.getByTestId("permission-revoked-p6")).toBeInTheDocument();
  });
});
