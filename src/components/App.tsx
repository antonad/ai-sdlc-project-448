import { Container, List, NativeSelect, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { formatDate, useSimulator, usersInGroup } from "../app";
import type { AccessSource, Config, InactivePermission } from "../app";
import { ConfigTransfer } from "./ConfigTransfer";
import { PermissionsPanel } from "./PermissionsPanel";

const describeSource = (source: AccessSource, config: Config): string => {
  if (source.kind === "direct") {
    return "Прямое разрешение";
  }
  const group = config.groups.find((candidate) => candidate.id === source.groupId);
  return `Группа «${group?.name ?? source.groupId}»`;
};

const describeInactive = (item: InactivePermission, config: Config): string => {
  const reason =
    item.reason === "expired"
      ? `закончилось ${formatDate(item.date)}`
      : `ещё не началось, с ${formatDate(item.date)}`;
  return `${describeSource(item, config)}: ${reason}`;
};

export const App = () => {
  const {
    config,
    checkAccess,
    grantPermission,
    revokePermission,
    revokePermissionFrom,
    exportJson,
    importJson,
  } = useSimulator();
  const [groupId, setGroupId] = useState("");
  const [userId, setUserId] = useState("");
  const [serviceId, setServiceId] = useState("");
  // Дата проверки живёт только в компоненте: не сохраняется и не попадает в конфигурацию.
  const [onDate, setOnDate] = useState("");

  const result = userId && serviceId ? checkAccess(userId, serviceId, onDate) : null;

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>Симулятор политик доступа</Title>
        <NativeSelect
          label="Группа"
          data-testid="group-filter"
          value={groupId}
          onChange={(event) => {
            const nextGroupId = event.currentTarget.value;
            setGroupId(nextGroupId);
            if (!usersInGroup(config, nextGroupId).some((user) => user.id === userId)) {
              setUserId("");
            }
          }}
          data={[
            { value: "", label: "Все группы" },
            ...config.groups.map((group) => ({ value: group.id, label: group.name })),
          ]}
        />
        <NativeSelect
          label="Сотрудник"
          data-testid="user-select"
          value={userId}
          onChange={(event) => setUserId(event.currentTarget.value)}
          data={[
            { value: "", label: "Не выбран" },
            ...usersInGroup(config, groupId).map((user) => ({ value: user.id, label: user.name })),
          ]}
        />
        <NativeSelect
          label="Сервис"
          data-testid="service-select"
          value={serviceId}
          onChange={(event) => setServiceId(event.currentTarget.value)}
          data={[
            { value: "", label: "Не выбран" },
            ...config.services.map((service) => ({ value: service.id, label: service.name })),
          ]}
        />
        <TextInput
          type="date"
          label="На дату"
          data-testid="access-date"
          value={onDate}
          onChange={(event) => setOnDate(event.currentTarget.value)}
        />
        <Paper withBorder p="md">
          <Text data-testid="access-result" fw={600}>
            {result === null
              ? "Выберите сотрудника и сервис"
              : result.granted
                ? "Доступ есть"
                : "Доступа нет"}
          </Text>
          {result?.granted && (
            <List data-testid="access-sources" mt="sm">
              {result.sources.map((source) => (
                <List.Item key={source.permissionId}>{describeSource(source, config)}</List.Item>
              ))}
            </List>
          )}
          {result && !result.granted && result.inactive.length > 0 && (
            <List data-testid="access-inactive" mt="sm">
              {result.inactive.map((item) => (
                <List.Item key={item.permissionId}>{describeInactive(item, config)}</List.Item>
              ))}
            </List>
          )}
        </Paper>
        <PermissionsPanel
          config={config}
          onGrant={grantPermission}
          onRevoke={revokePermission}
          onRevokeFrom={revokePermissionFrom}
        />
        <ConfigTransfer exportJson={exportJson} onImport={importJson} />
      </Stack>
    </Container>
  );
};
