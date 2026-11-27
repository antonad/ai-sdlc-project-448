import { Alert, Button, Group, List, Paper, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { formatInterval, formatMoment } from "../app";
import type { Config, EntityChange, ImportPreview, ImportResult, Permission } from "../app";
import { describePermission } from "./permission-text";

type Props = {
  /** Текущая конфигурация: по ней названы убранные разрешения. */
  config: Config;
  exportJson: () => string;
  onStartImport: (text: string) => ImportResult;
  preview: ImportPreview | null;
  onConfirm: () => void;
  onCancel: () => void;
};

const KIND_NAMES: Record<EntityChange["kind"], string> = {
  users: "Пользователи",
  groups: "Группы",
  services: "Сервисы",
};

const describeFull = (permission: Permission, config: Config): string => {
  const revoked =
    permission.revokedAt === undefined ? "" : `, отозвано с ${formatMoment(permission.revokedAt)}`;
  return `${describePermission(permission, config)}, ${formatInterval(permission)}${revoked}`;
};

export const ConfigTransfer = ({
  config,
  exportJson,
  onStartImport,
  preview,
  onConfirm,
  onCancel,
}: Props) => {
  const [errors, setErrors] = useState<string[]>([]);
  const [imported, setImported] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    const result = onStartImport(await file.text());
    setImported(false);
    setErrors(result.ok ? [] : result.errors);
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={2} size="h3">
          Конфигурация
        </Title>
        <Group>
          <Button
            component="a"
            variant="default"
            data-testid="export-link"
            download="access-policy-config.json"
            href={`data:application/json;charset=utf-8,${encodeURIComponent(exportJson())}`}
          >
            Экспортировать
          </Button>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Импортировать конфигурацию"
            data-testid="import-input"
            onChange={(event) => {
              void handleFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </Group>
        {preview && (
          <Paper withBorder p="sm" data-testid="import-preview">
            <Stack gap="xs">
              <Text fw={600}>Что изменится после подтверждения</Text>
              {preview.empty && (
                <Text data-testid="import-preview-empty">
                  Файл совпадает с текущей конфигурацией, ничего не изменится
                </Text>
              )}
              {preview.added.map((permission) => (
                <Text key={permission.id} data-testid={`import-preview-added-${permission.id}`}>
                  {`Появится: ${describeFull(permission, preview.result)}`}
                </Text>
              ))}
              {preview.removed.map((permission) => (
                <Text key={permission.id} data-testid={`import-preview-removed-${permission.id}`}>
                  {`Исчезнет: ${describeFull(permission, config)}`}
                </Text>
              ))}
              {preview.changed.map(({ before, after }) => (
                <Text key={after.id} data-testid={`import-preview-changed-${after.id}`}>
                  {`Изменится: было ${describeFull(before, config)}; станет ${describeFull(after, preview.result)}`}
                </Text>
              ))}
              {preview.kept.map((permission) => (
                <Text key={permission.id} data-testid={`import-preview-kept-${permission.id}`}>
                  {`Отзыв сохранится: ${describeFull(permission, preview.result)}`}
                </Text>
              ))}
              {preview.entities.length > 0 && (
                <Text data-testid="import-entities">
                  {preview.entities
                    .map(
                      ({ kind, added, removed, changed }) =>
                        `${KIND_NAMES[kind]}: добавлено ${added}, убрано ${removed}, изменено ${changed}`,
                    )
                    .join("; ")}
                </Text>
              )}
              <Group>
                <Button
                  data-testid="import-confirm"
                  onClick={() => {
                    onConfirm();
                    setImported(true);
                  }}
                >
                  Применить
                </Button>
                <Button variant="default" data-testid="import-cancel" onClick={onCancel}>
                  Отменить
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}
        {imported && !preview && <Text data-testid="import-status">Конфигурация заменена</Text>}
        {errors.length > 0 && (
          <Alert
            color="red"
            title="Файл не принят, конфигурация осталась прежней"
            data-testid="import-error"
          >
            <List>
              {errors.map((error) => (
                <List.Item key={error}>{error}</List.Item>
              ))}
            </List>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
};
