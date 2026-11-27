export type User = { id: string; name: string; groupIds: string[] };

export type Group = { id: string; name: string };

export type Service = { id: string; name: string };

export type Subject = { type: "user" | "group"; id: string };

export type Permission = {
  id: string;
  subject: Subject;
  serviceId: string;
  /** Момент начала в UTC `ГГГГ-ММ-ДДTчч:ммZ`, включительно. Нет поля: начало не ограничено. */
  startsAt?: string;
  /** Момент окончания в UTC `ГГГГ-ММ-ДДTчч:ммZ`, исключительно. Нет поля: окончание не ограничено. */
  expiresAt?: string;
  /** Момент отзыва в UTC `ГГГГ-ММ-ДДTчч:ммZ`: с него разрешение не действует. Нет поля: не отозвано. */
  revokedAt?: string;
};

export type Config = {
  users: User[];
  groups: Group[];
  services: Service[];
  permissions: Permission[];
};
