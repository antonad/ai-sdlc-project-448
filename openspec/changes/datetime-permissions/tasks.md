# Tasks

Реализация ведётся скилом `tdd`: сначала тест, затем код. После каждой группы проходят `npm run typecheck` и `npm test`.

## 1. Моменты в слое приложения

- [x] 1.1 В `src/app/dates.ts` добавить `isValidMoment`, `nextDay`, `nowMoment`, `formatMoment`, `momentToDate`; тесты в `src/app/dates.test.ts`: валидные и невалидные строки (`2026-02-30T10:00`, `2026-03-01T25:00`, без времени), 31.12.2026 даёт следующий день 01.01.2027, подмена времени (`vi.useFakeTimers`) для `nowMoment`, формат `01.12.2026 09:00`
- [x] 1.2 Убрать из `src/app/dates.ts` день-ориентированные `todayDay`, `previousDay`, `dateToDay`, `intervalError` по дням заменить на проверку момента; тесты обновить, `npm run typecheck` проходит

## 2. Модель и расчёт

- [x] 2.1 В `src/domain/model.ts` заменить `startsOn`/`endsOn` на `startsAt`/`expiresAt`; в `src/domain/access.ts` сравнивать ключ минуты из `at` с полуоткрытым интервалом, переименовать `InactivePermission.date` в `boundary`; тесты в `src/domain/access.test.ts` на все сценарии спеки (момент начала, минута до, момент окончания, секунды, одна граница, постоянное, два источника внутри интервала, групповое, независимые источники)
- [x] 2.2 Проверить, что часы в домене не читаются: `npm run lint:arch` проходит

## 3. Файл конфигурации и хранение

- [x] 3.1 В `src/app/config-file.ts` читать `startsAt`/`expiresAt` (проверка момента, окончание строго позже начала), принимать версии 1, 2, 3, отвергать 4 и выше, писать `version` 3; тесты в `src/app/config-file.test.ts`: круговой обмен со сроками, неверные моменты с указанием места, версия 4
- [x] 3.2 Перевод версий 1 и 2: `startsOn` в начало дня, `endsOn` в начало следующего дня; тесты: доступ до и после перевода одинаков для каждого дня сценария (включая 14.12.2026 23:59 и 15.12.2026 00:00), сохранённая копия версии 2 в `localStorage` читается с переводом (`src/app/storage.test.ts`)

## 4. Операции над разрешениями

- [x] 4.1 В `src/app/permissions.ts` перевести `addPermission` на `startsAt`/`expiresAt` (дубль по обеим границам, окончание строго позже начала); тесты в `src/app/permissions.test.ts`
- [x] 4.2 Заменить `revokePermissionFrom` на отзыв с момента (`invalid-moment`, `unknown-permission`, `not-after-start`, `already-ended`, `revoked`); тесты на сценарии спеки, на СБ 3 (остальные записи равны) и СБ 4 (Анна Белова, `p1`)
- [x] 4.3 В `src/app/index.ts` обновить `useSimulator` (`checkAccess` принимает момент, пустое значение означает «сейчас»), экспортировать `nowMoment`, `GrantResult`, `RevokeFromResult`

## 5. Экран

- [x] 5.1 В `src/components/App.tsx` заменить `access-date` на `evaluation-time` (`datetime-local`, по умолчанию `nowMoment()`, не сохраняется), причины недействующих с моментом; тесты в `src/components/App.test.tsx`: значение по умолчанию, внутри интервала, до начала и после окончания (`access-sources` не показан), смена без перезагрузки, пустое поле
- [x] 5.2 В `src/components/PermissionsPanel.tsx` заменить поля формы на `permission-starts-at` и `permission-expires-at`, список срока «с … до …», отзыв «Отозвать с момента»; тесты: выдача, список, групповое разрешение, постоянное рядом с временным не даёт «Это разрешение уже выдано», отзыв и отказы

## 6. Документы и итоговая проверка

- [x] 6.1 Обновить `docs/product.md`, `docs/architecture.md`, `README.md` там, где описаны даты, и убедиться поиском (`Grep` по `startsOn`, `endsOn`, `access-date`, `permission-starts-on`, `permission-ends-on`), что старых имён не осталось в `src` и в актуальных документах
- [x] 6.2 Пройти `npm run typecheck`, `npm test`, `npm run lint`, `npm run lint:arch`, `npm run build`, `npm run test:coverage`, `npx @fission-ai/openspec validate --all --strict`: все завершаются с кодом 0

## Workflow follow-up

- ADR о времени в `docs/adr/` и второй файл ревью в `docs/reviews/` делаются отдельно от этого изменения.
- Независимое ревью скилом `review-diff` в отдельной сессии, затем архивация изменения.
