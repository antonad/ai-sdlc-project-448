import { useState } from "react";
import { calculateAccess } from "../domain/access";
import type { AccessResult } from "../domain/access";
import type { Config, Subject } from "../domain/model";
import { exportConfig, parseConfigFile } from "./config-file";
import { intervalError, momentToDate } from "./dates";
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

export type { AccessResult, AccessSource, InactivePermission } from "../domain/access";
export type { Interval, RevokeFromResult } from "./permissions";
export type { Config, Group, Permission, Service, Subject, User } from "../domain/model";

export type GrantResult = "granted" | "exists" | "invalid-interval";
export type ImportResult = { ok: true } | { ok: false; errors: string[] };

export type Simulator = {
  config: Config;
  /** `atMoment` — момент `ГГГГ-ММ-ДДTчч:мм`; пустая или невалидная строка значит «сейчас». */
  checkAccess: (userId: string, serviceId: string, atMoment?: string) => AccessResult;
  /** Выдаёт постоянное разрешение или разрешение на интервал. Неверный интервал конфигурацию не меняет. */
  grantPermission: (subject: Subject, serviceId: string, interval?: Interval) => GrantResult;
  /** Удаляет разрешение целиком: после этого симулятор не помнит, что доступ был. */
  revokePermission: (permissionId: string) => void;
  /**
   * Отзывает разрешение с момента `ГГГГ-ММ-ДДTчч:мм` (первая минута без доступа): момент
   * становится `expiresAt`, время до него остаётся в проверке. При отказе конфигурацию не меняет.
   */
  revokePermissionFrom: (permissionId: string, moment: string) => RevokeFromResult;
  /** Текст файла экспорта для текущей конфигурации. */
  exportJson: () => string;
  /** Проверяет файл целиком. При ошибке конфигурация не меняется, при успехе заменяется и сохраняется. */
  importJson: (text: string) => ImportResult;
};

// Слой приложения единственный отдаёт компонентам конфигурацию и результат расчёта и единственный
// обращается к хранилищу браузера. Момент расчёта берётся здесь, модуль расчёта часы не читает.
export const useSimulator = (): Simulator => {
  const [config, setConfig] = useState<Config>(() => loadConfig(window.localStorage));

  const replace = (next: Config): void => {
    setConfig(next);
    saveConfig(window.localStorage, next);
  };

  return {
    config,
    checkAccess: (userId, serviceId, atMoment) =>
      calculateAccess(config, { userId, serviceId, at: momentToDate(atMoment) }),
    grantPermission: (subject, serviceId, interval) => {
      const bounds = normalizeInterval(interval);
      if (intervalError(bounds.startsAt, bounds.expiresAt)) {
        return "invalid-interval";
      }
      const next = addPermission(config, subject, serviceId, bounds);
      if (next === config) {
        return "exists";
      }
      replace(next);
      return "granted";
    },
    revokePermission: (permissionId) => replace(removePermission(config, permissionId)),
    revokePermissionFrom: (permissionId, moment) => {
      const outcome = revokePermissionFrom(config, permissionId, moment);
      if (outcome.result === "revoked") {
        replace(outcome.config);
      }
      return outcome.result;
    },
    exportJson: () => exportConfig(config),
    importJson: (text) => {
      const result = parseConfigFile(text);
      if (!result.ok) {
        return result;
      }
      replace(result.config);
      return { ok: true };
    },
  };
};
