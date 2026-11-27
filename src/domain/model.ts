export type User = { id: string; name: string; groupIds: string[] };

export type Group = { id: string; name: string };

export type Service = { id: string; name: string };

export type Subject = { type: "user" | "group"; id: string };

export type Permission = {
  id: string;
  subject: Subject;
  serviceId: string;
  /** Момент начала `ГГГГ-ММ-ДДTчч:мм`, включительно. Нет поля: начало не ограничено. */
  startsAt?: string;
  /** Момент окончания `ГГГГ-ММ-ДДTчч:мм`, исключительно. Нет поля: окончание не ограничено. */
  expiresAt?: string;
  /** Момент отзыва `ГГГГ-ММ-ДДTчч:мм`: с него разрешение не действует. Нет поля: не отозвано. */
  revokedAt?: string;
};

export type Config = {
  users: User[];
  groups: Group[];
  services: Service[];
  permissions: Permission[];
};
