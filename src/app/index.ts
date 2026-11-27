import { useState } from "react";
import { calculateAccess, explainAccess } from "../domain/access";
import type { AccessResult, ExplainedPermission } from "../domain/access";
import type { Config, Subject } from "../domain/model";
import { exportConfig, parseConfigFile } from "./config-file";
import { intervalError, isValidMoment, isValidUtcMoment, localToUtc, momentToDate } from "./dates";
import { buildImportPreview } from "./import-preview";
import type { ImportPreview } from "./import-preview";
import {
  addPermission,
  normalizeInterval,
  removePermission,
  revokePermissionFrom,
} from "./permissions";
import type { Interval, RevokeFromResult } from "./permissions";
import { loadConfig, saveConfig } from "./storage";

export { formatInterval, formatMoment, nowMoment } from "./dates";
export { usersInGroup } from "./users";

export type {
  AccessResult,
  AccessSource,
  ExplainedPermission,
  ExplainedStatus,
  InactivePermission,
} from "../domain/access";
export type { Interval, RevokeFromResult } from "./permissions";
export type { EntityChange, ImportPreview } from "./import-preview";
export type { Config, Group, Permission, Service, Subject, User } from "../domain/model";

export type GrantResult = "granted" | "exists" | "invalid-interval";
export type ImportResult = { ok: true } | { ok: false; errors: string[] };

export type Simulator = {
  config: Config;
  /** `atMoment` — момент `ГГГГ-ММ-ДДTчч:мм`; пустая или невалидная строка значит «сейчас». */
  checkAccess: (userId: string, serviceId: string, atMoment?: string) => AccessResult;
  /**
   * Все разрешения пары со статусом на момент (формат и правила пустого момента как у `checkAccess`):
   * действует, ещё не началось, истекло, отозвано. Ничего не меняет.
   */
  explainAccess: (userId: string, serviceId: string, atMoment?: string) => ExplainedPermission[];
  /** Выдаёт постоянное разрешение или разрешение на интервал. Неверный интервал конфигурацию не меняет. */
  grantPermission: (subject: Subject, serviceId: string, interval?: Interval) => GrantResult;
  /** Удаляет разрешение целиком: после этого симулятор не помнит, что доступ был. */
  revokePermission: (permissionId: string) => void;
  /**
   * Отзывает разрешение с локального момента `ГГГГ-ММ-ДДTчч:мм` (первая минута без доступа): момент
   * в UTC записывается в `revokedAt`, срок остаётся прежним, время до отзыва остаётся в проверке.
   * При отказе конфигурацию не меняет.
   */
  revokePermissionFrom: (permissionId: string, moment: string) => RevokeFromResult;
  /** Текст файла экспорта для текущей конфигурации. */
  exportJson: () => string;
  /**
   * Проверяет файл целиком и открывает предпросмотр. Ни при ошибке, ни при успехе конфигурация и
   * хранилище не меняются; новый файл заменяет прежний предпросмотр, файл с ошибкой его закрывает.
   */
  startImport: (text: string) => ImportResult;
  /** Различия между текущей конфигурацией и результатом подтверждения; `null`, если файл не открыт. */
  importPreview: ImportPreview | null;
  /**
   * Применяет открытый файл: конфигурация заменяется и сохраняется, отзывы текущей конфигурации
   * переносятся на те же разрешения из файла. Без открытого предпросмотра ничего не делает.
   */
  confirmImport: () => void;
  /** Закрывает предпросмотр, ничего не меняя. */
  cancelImport: () => void;
};

// Слой приложения единственный отдаёт компонентам конфигурацию и результат расчёта и единственный
// обращается к хранилищу браузера. Момент расчёта берётся здесь, модуль расчёта часы не читает.
export const useSimulator = (): Simulator => {
  const [config, setConfig] = useState<Config>(() => loadConfig(window.localStorage));
  // Проверенный, но ещё не применённый файл.
  const [pending, setPending] = useState<Config | null>(null);

  const replace = (next: Config): void => {
    setConfig(next);
    saveConfig(window.localStorage, next);
  };

  return {
    config,
    checkAccess: (userId, serviceId, atMoment) =>
      calculateAccess(config, { userId, serviceId, at: momentToDate(atMoment) }),
    explainAccess: (userId, serviceId, atMoment) =>
      explainAccess(config, { userId, serviceId, at: momentToDate(atMoment) }),
    grantPermission: (subject, serviceId, interval) => {
      // Компонент отдаёт локальное время полей, в данные оно попадает в UTC.
      const bounds = normalizeInterval(interval);
      if (intervalError(bounds.startsAt, bounds.expiresAt)) {
        return "invalid-interval";
      }
      const utc = {
        ...(bounds.startsAt === undefined ? {} : { startsAt: localToUtc(bounds.startsAt) }),
        ...(bounds.expiresAt === undefined ? {} : { expiresAt: localToUtc(bounds.expiresAt) }),
      };
      // После перевода порядок и годы проверяются заново: переход на летнее время и края
      // диапазона лет могут дать UTC-значение, которое файл не примет обратно.
      if (intervalError(utc.startsAt, utc.expiresAt, isValidUtcMoment)) {
        return "invalid-interval";
      }
      const next = addPermission(config, subject, serviceId, utc);
      if (next === config) {
        return "exists";
      }
      replace(next);
      return "granted";
    },
    revokePermission: (permissionId) => replace(removePermission(config, permissionId)),
    revokePermissionFrom: (permissionId, moment) => {
      if (!isValidMoment(moment)) {
        return "invalid-moment";
      }
      const outcome = revokePermissionFrom(config, permissionId, localToUtc(moment));
      if (outcome.result === "revoked") {
        replace(outcome.config);
      }
      return outcome.result;
    },
    exportJson: () => exportConfig(config),
    startImport: (text) => {
      const result = parseConfigFile(text);
      // Файл держится только в памяти страницы: после перезагрузки предпросмотра нет.
      setPending(result.ok ? result.config : null);
      return result.ok ? { ok: true } : result;
    },
    importPreview: pending === null ? null : buildImportPreview(config, pending),
    confirmImport: () => {
      if (pending === null) {
        return;
      }
      // Предпросмотр и подтверждение считают от одной текущей конфигурации, поэтому отзыв,
      // сделанный при открытом предпросмотре, тоже сохранится.
      replace(buildImportPreview(config, pending).result);
      setPending(null);
    },
    cancelImport: () => setPending(null),
  };
};
