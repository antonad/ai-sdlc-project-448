# Tasks

Реализация ведётся скилом `tdd`: сначала тест, затем код. После каждой группы проходят `npm run typecheck` и `npm test`.

## 1. Модель и расчёт

- [x] 1.1 В `src/domain/model.ts` добавить `revokedAt?`; в `src/domain/access.ts` учесть отзыв (причина `revoked` с границей `revokedAt`, порядок `not-started`, `revoked`, `expired`); тесты в `src/domain/access.test.ts` на сценарии спеки: до и с момента отзыва, отзыв и окончание вместе, группа, два прямых временных, группа сохраняется, без отзыва прежнее поведение
- [x] 1.2 Проверить `npm run lint:arch`: домен не читает часы

## 2. Файл конфигурации

- [x] 2.1 В `src/app/config-file.ts` читать `revokedAt` (момент, строго внутри интервала), `version` остаётся 3; тесты в `src/app/config-file.test.ts`: круговой обмен с отзывом, прежний файл без поля, неверный момент с местом `permissions[N].revokedAt`, отзыв вне интервала; в `src/app/storage.test.ts` копия с `revokedAt` читается

## 3. Операция отзыва

- [x] 3.1 В `src/app/permissions.ts` переписать `revokePermissionFrom` на запись `revokedAt` с результатами `revoked`, `invalid-moment`, `unknown-permission`, `permanent`, `already-revoked`, `not-after-start`, `already-ended`; тесты в `src/app/permissions.test.ts`: срок, группа, прошлое, каждый отказ с той же ссылкой, порядок проверок, СБ 3 (остальные записи равны, исходный объект цел), СБ 4 (Анна Белова, `p1`)
- [x] 3.2 В `src/app/index.ts` обновить тип `RevokeFromResult` и `useSimulator`; `npm run typecheck` проходит

## 4. Экран

- [x] 4.1 В `src/components/App.tsx` передать `evaluation-time` в панель, показать причину «отозвано …» в `access-inactive`; тест в `src/components/App.test.tsx`: отказ по отозванному разрешению называет причину
- [x] 4.2 В `src/components/PermissionsPanel.tsx` заменить поля отзыва в строках на одно `permission-revoked-at` и кнопки `permission-revoke-<id>` (только с интервалом и без отзыва), сообщение «Разрешение отозвано», отметка «отозвано с …» (`permission-revoked-<id>`); тесты в `src/components/Permissions.test.tsx`: кнопка есть и нет, общее поле, пустое поле берёт `evaluation-time`, строка остаётся, отказы, `permission-remove-<id>`, импорт прежнего файла без отзыва

## 5. Документы и итоговая проверка

- [x] 5.1 Обновить `docs/product.md` и `README.md` (отзыв по моменту с отметкой); Grep по `permission-revoke-open`, `permission-revoke-date`, `permission-revoke-confirm` не находит старых имён в `src`
- [x] 5.2 Пройти `npm run typecheck`, `npm test`, `npm run lint`, `npm run lint:arch`, `npm run build`, `npm run test:coverage`, `npx @fission-ai/openspec validate --all --strict`: все с кодом 0

## Workflow follow-up

- Независимое ревью скилом `review-diff` в отдельной сессии с отчётом в `docs/reviews/revoked-at.md`, затем архивация изменения.