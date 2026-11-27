import { Container, List, NativeSelect, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { formatMoment, nowMoment, useSimulator, usersInGroup } from "../app";
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
  const moment = formatMoment(item.boundary);
  const reason =
    item.reason === "expired"
      ? `закончилось ${moment}`
      : item.reason === "revoked"
        ? `отозвано ${moment}`
        : `ещё не началось, с ${moment}`;
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
  // Момент проверки живёт только в компоненте: не сохраняется и не попадает в конфигурацию.
  const [atMoment, setAtMoment] = useState(nowMoment);

  const result = userId && serviceId ? checkAccess(userId, serviceId, atMoment) : null;

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
          type="datetime-local"
          label="На момент"
          data-testid="evaluation-time"
          value={atMoment}
          onChange={(event) => setAtMoment(event.currentTarget.value)}
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
          evaluationMoment={atMoment}
        />
        <ConfigTransfer exportJson={exportJson} onImport={importJson} />
      </Stack>
    </Container>
  );
};
