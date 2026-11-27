import { Button, Group, NativeSelect, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { formatInterval, formatMoment, nowMoment } from "../app";
import type { Config, GrantResult, Interval, Permission, RevokeFromResult, Subject } from "../app";

type Props = {
  config: Config;
  onGrant: (subject: Subject, serviceId: string, interval?: Interval) => GrantResult;
  onRevoke: (permissionId: string) => void;
  onRevokeFrom: (permissionId: string, moment: string) => RevokeFromResult;
};

const subjectName = (subject: Subject, config: Config): string => {
  if (subject.type === "user") {
    return config.users.find(({ id }) => id === subject.id)?.name ?? subject.id;
  }
  const name = config.groups.find(({ id }) => id === subject.id)?.name ?? subject.id;
  return `Группа «${name}»`;
};

const describePermission = (permission: Permission, config: Config): string => {
  const service = config.services.find(({ id }) => id === permission.serviceId);
  return `${subjectName(permission.subject, config)}: ${service?.name ?? permission.serviceId}`;
};

const toSubject = (value: string): Subject | null => {
  const [type, id] = value.split(":");
  return (type === "user" || type === "group") && id ? { type, id } : null;
};

const MESSAGES: Record<GrantResult, string> = {
  granted: "Разрешение выдано",
  exists: "Это разрешение уже выдано",
  "invalid-interval": "Окончание должно быть позже начала",
};

const REVOKE_FAILURES: Record<Exclude<RevokeFromResult, "revoked">, string> = {
  "invalid-moment": "Момент отзыва должен быть реальным моментом в формате ГГГГ-ММ-ДДTчч:мм",
  "unknown-permission": "Разрешение не найдено",
  "not-after-start": "Момент отзыва не позже начала, удалите разрешение",
  "already-ended": "Разрешение и так закончится раньше",
};

export const PermissionsPanel = ({ config, onGrant, onRevoke, onRevokeFrom }: Props) => {
  // Отзыв с момента открыт максимум в одной строке: идентификатор разрешения и введённый момент.
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeMoment, setRevokeMoment] = useState("");
  const [subjectValue, setSubjectValue] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");

  const subject = toSubject(subjectValue);

  const grant = () => {
    if (!subject || !serviceId) {
      return;
    }
    const result = onGrant(subject, serviceId, { startsAt, expiresAt });
    setMessage(MESSAGES[result]);
  };

  const openRevoke = (permissionId: string) => {
    setRevokingId(permissionId);
    setRevokeMoment(nowMoment());
  };

  const revokeFrom = (permissionId: string) => {
    const result = onRevokeFrom(permissionId, revokeMoment);
    if (result === "revoked") {
      setMessage(`Разрешение отозвано с ${formatMoment(revokeMoment)}`);
      setRevokingId(null);
    } else {
      setMessage(REVOKE_FAILURES[result]);
    }
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={2} size="h3">
          Разрешения
        </Title>
        {config.permissions.map((permission) => (
          <Group
            key={permission.id}
            justify="space-between"
            data-testid={`permission-item-${permission.id}`}
          >
            <Text>
              {describePermission(permission, config)}
              {", "}
              <span data-testid={`permission-interval-${permission.id}`}>
                {formatInterval(permission)}
              </span>
            </Text>
            <Group gap="xs" align="flex-end">
              {revokingId === permission.id && (
                <>
                  <TextInput
                    type="datetime-local"
                    size="xs"
                    aria-label="Момент отзыва"
                    data-testid={`permission-revoke-date-${permission.id}`}
                    value={revokeMoment}
                    onChange={(event) => setRevokeMoment(event.currentTarget.value)}
                  />
                  <Button
                    size="xs"
                    data-testid={`permission-revoke-confirm-${permission.id}`}
                    onClick={() => revokeFrom(permission.id)}
                  >
                    Отозвать
                  </Button>
                </>
              )}
              <Button
                variant="default"
                size="xs"
                data-testid={`permission-revoke-open-${permission.id}`}
                onClick={() => openRevoke(permission.id)}
              >
                Отозвать с момента
              </Button>
              <Button
                variant="default"
                size="xs"
                data-testid={`permission-remove-${permission.id}`}
                onClick={() => onRevoke(permission.id)}
              >
                Удалить
              </Button>
            </Group>
          </Group>
        ))}
        <Group align="flex-end">
          <NativeSelect
            label="Кому выдать"
            data-testid="permission-subject-select"
            value={subjectValue}
            onChange={(event) => setSubjectValue(event.currentTarget.value)}
            data={[
              { value: "", label: "Не выбрано" },
              ...config.users.map((user) => ({ value: `user:${user.id}`, label: user.name })),
              ...config.groups.map((group) => ({
                value: `group:${group.id}`,
                label: `Группа «${group.name}»`,
              })),
            ]}
          />
          <NativeSelect
            label="К какому сервису"
            data-testid="permission-service-select"
            value={serviceId}
            onChange={(event) => setServiceId(event.currentTarget.value)}
            data={[
              { value: "", label: "Не выбран" },
              ...config.services.map((service) => ({ value: service.id, label: service.name })),
            ]}
          />
          <TextInput
            type="datetime-local"
            label="Действует с"
            data-testid="permission-starts-at"
            value={startsAt}
            onChange={(event) => setStartsAt(event.currentTarget.value)}
          />
          <TextInput
            type="datetime-local"
            label="Действует до"
            data-testid="permission-expires-at"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.currentTarget.value)}
          />
          <Button data-testid="permission-add" disabled={!subject || !serviceId} onClick={grant}>
            Выдать
          </Button>
        </Group>
        {message && <Text data-testid="permission-message">{message}</Text>}
      </Stack>
    </Paper>
  );
};
