import { useState } from "react";
import { calculateAccess } from "../domain/access";
import type { AccessResult } from "../domain/access";
import type { Config, Subject } from "../domain/model";
import { exportConfig, parseConfigFile } from "./config-file";
import { dateToDay, intervalError } from "./dates";
import { addPermission, normalizeInterval, removePermission } from "./permissions";
import type { Interval } from "./permissions";
import { loadConfig, saveConfig } from "./storage";

export { formatDate, formatInterval } from "./dates";
export { usersInGroup } from "./users";

export type { AccessResult, AccessSource, InactivePermission } from "../domain/access";
export type { Interval } from "./permissions";
export type { Config, Group, Permission, Service, Subject, User } from "../domain/model";

export type GrantResult = "granted" | "exists" | "invalid-interval";
export type ImportResult = { ok: true } | { ok: false; errors: string[] };

export type Simulator = {
  config: Config;
  /** `onDate` — день `ГГГГ-ММ-ДД`; пустая или невалидная строка значит «сегодня». */
  checkAccess: (userId: string, serviceId: string, onDate?: string) => AccessResult;
  /** Выдаёт постоянное разрешение или разрешение на интервал. Неверный интервал конфигурацию не меняет. */
  grantPermission: (subject: Subject, serviceId: string, interval?: Interval) => GrantResult;
  revokePermission: (permissionId: string) => void;
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
    checkAccess: (userId, serviceId, onDate) =>
      calculateAccess(config, { userId, serviceId, at: dateToDay(onDate) }),
    grantPermission: (subject, serviceId, interval) => {
      const bounds = normalizeInterval(interval);
      if (intervalError(bounds.startsOn, bounds.endsOn)) {
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
