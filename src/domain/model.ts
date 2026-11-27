export type User = { id: string; name: string; groupIds: string[] };

export type Group = { id: string; name: string };

export type Service = { id: string; name: string };

export type Subject = { type: "user" | "group"; id: string };

export type Permission = {
  id: string;
  subject: Subject;
  serviceId: string;
  /** Первый день действия, `ГГГГ-ММ-ДД`, включительно. Нет поля: начало не ограничено. */
  startsOn?: string;
  /** Последний день действия, `ГГГГ-ММ-ДД`, включительно. Нет поля: окончание не ограничено. */
  endsOn?: string;
};

export type Config = {
  users: User[];
  groups: Group[];
  services: Service[];
  permissions: Permission[];
};
