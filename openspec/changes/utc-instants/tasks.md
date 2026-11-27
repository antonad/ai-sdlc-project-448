# Tasks

Реализация ведётся скилом `tdd`: сначала тест, затем код. После каждой группы проходят `npm run typecheck` и `npm test`.

## 1. Граница локального и UTC

- [x] 1.1 В `vite.config.ts` зафиксировать `TZ` для тестов (UTC+5 без летнего времени); в `src/app/dates.ts` добавить `localToUtc`, `utcToLocal`, `isValidUtcMoment`, перевести `formatMoment` и `formatInterval` на UTC-вход с локальным показом; тесты в `src/app/dates.test.ts`: перевод туда и обратно, граница суток и года, `2026-02-30T10:00Z` и значение без `Z` отвергаются, формат даёт «14.12.2026 23:00» для `2026-12-14T18:00Z`

## 2. Расчёт

- [x] 2.1 В `src/domain/access.ts` строить `minuteKey` из UTC (`toISOString`), без `getHours`; обновить `src/domain/access.test.ts` на UTC-значения и добавить тест, что результат не зависит от пояса (один `at`, разные `process.env.TZ` не нужны: домен берёт мгновение); `npm run lint:arch` проходит

## 3. Файл и хранение

- [x] 3.1 В `src/app/config-file.ts`: `version` 4, чтение версий 1–4, версия 4 проверяет UTC-моменты, версии 1–3 читаются как UTC (версия 3 добавляет `Z`, версия 2 переводит дни в `Т00:00Z` и начало следующего дня), версия 5 отвергается; тесты в `src/app/config-file.test.ts`: круговой обмен, перевод версий 1, 2, 3, значения без `Z` в версии 4 отвергаются с местом, `revokedAt` с `Z`; `src/app/storage.test.ts`: копии версий 1–3 читаются как UTC

## 4. Операции и хук

- [x] 4.1 В `src/app/index.ts` переводить значения компонентов в UTC на границе: `grantPermission`, `revokePermissionFrom`, `checkAccess` принимают локальные значения; `src/app/permissions.ts` работает с UTC; тесты `src/app/permissions.test.ts` на UTC-значения; `npm run typecheck` проходит
- [x] 4.2 Тесты экрана `src/components/App.test.tsx` и `src/components/Permissions.test.tsx` под фиксированный пояс: выдача в UTC+5 пишет UTC в запись и localStorage, список и причины показывают локальное время, отзыв и пустое поле берут `evaluation-time`, импорт файла версии 3 читается как UTC

## 5. Документы и итоговая проверка

- [x] 5.1 Дополнить `docs/adr/0001-time-model.md` решением об UTC и последствием для старых данных; обновить `README.md`, `docs/product.md` и `docs/architecture.md`
- [x] 5.2 Пройти `npm run typecheck`, `npm test`, `npm run lint`, `npm run lint:arch`, `npm run build`, `npm run test:coverage`, `npx @fission-ai/openspec validate --all --strict`: все с кодом 0

## Workflow follow-up

- Независимое ревью скилом `review-diff` в отдельной сессии с отчётом в `docs/reviews/utc-instants.md`, затем архивация изменения.