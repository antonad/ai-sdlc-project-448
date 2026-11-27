# Tasks

Реализация ведётся скилом `tdd`: сначала тест, затем код.

## 1. Даты

- [x] 1.1 В `src/app/dates.ts` добавить `previousDay(text)`; тест в `src/app/dates.test.ts`: 27.11 даёт 26.11, 01.01.2027 даёт 31.12.2026, 01.03.2028 даёт 29.02.2028, 01.03.2027 даёт 28.02.2027
- [x] 1.2 В `src/app/dates.ts` добавить `todayDay()` (локальный день `ГГГГ-ММ-ДД` из текущего времени); тест с подменой времени (`vi.useFakeTimers`): сегодня 27.11.2026 даёт `2026-11-27`

## 2. Операция отзыва

- [x] 2.1 В `src/app/permissions.ts` добавить `revokePermissionFrom(config, permissionId, date)` с результатами `revoked`, `invalid-date`, `unknown-permission`, `not-after-start`, `already-ended`; тесты в `src/app/permissions.test.ts` на сценарии спеки: срок, бессрочное, граница месяца и года, групповое, дата в прошлом
- [x] 2.2 Тесты отказов в `src/app/permissions.test.ts`: дата не позже `startsOn`, дата равна началу, разрешение и так закончится раньше, пустая и несуществующая дата, неизвестный идентификатор; при каждом отказе возвращается та же ссылка на конфигурацию
- [x] 2.3 Тесты затрагиваемых записей в `src/app/permissions.test.ts`: на учебных данных остальные разрешения, пользователи, группы и сервисы равны прежним, исходная конфигурация не мутирована; отзыв `p1` у Анны Беловой оставляет доступ через группу «Бухгалтерия» на 27.11.2026 (через `calculateAccess`) и называет оба источника на 26.11.2026

## 3. Слой приложения

- [x] 3.1 В `src/app/index.ts` добавить тип `RevokeFromResult`, `Simulator.revokePermissionFrom(permissionId, date)` (при `revoked` вызывает `replace`, при отказе ничего не меняет и не сохраняет) и экспорт `todayDay`; комментарий в `Simulator` различает `revokePermission` (удаление) и `revokePermissionFrom` (отзыв с даты); проверить тестом на уровне `App` в задаче 4.2

## 4. Панель разрешений

- [x] 4.1 В `src/components/PermissionsPanel.tsx` добавить кнопку «Отозвать с даты», поле даты с `todayDay()` по умолчанию и кнопку «Отозвать», сообщения по результату; в `src/components/App.tsx` пробросить `revokePermissionFrom` (импорты только из `../app`)
- [x] 4.2 Тесты в `src/components/App.test.tsx`: успех («Разрешение отозвано с 27.11.2026», строка показывает срок по 26.11.2026, значение в `localStorage` обновлено); дата по умолчанию сегодняшняя; три отказа с сообщениями и неизменной строкой и `localStorage`; «Удалить» работает как прежде; после отзыва проверка на 26.11.2026 показывает доступ, на 27.11.2026 показывает, что разрешение закончилось 26.11.2026

## 5. Спеки и проверки

- [x] 5.1 `npx @fission-ai/openspec validate --specs` и `openspec validate revoke-permission-from-date` проходят без ошибок
- [x] 5.2 Пройти по порядку `npm run typecheck`, `npm test`, `npm run lint`, `npm run lint:arch`, `npm run build`; затем `npm run test:coverage` (пороги в `vite.config.ts` держатся); в `src` нет `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, в `src/domain` нет изменений (`git diff --stat src/domain` пуст)

## Workflow follow-up

- Независимое ревью отдельной сессией: скил `review-diff`, сверка с изменением и `docs/security-requirements.md` (СБ 3 и СБ 4).
- Проверки скилом `verify`, результат читает человек.
- `/openspec-archive-change` после влития.
