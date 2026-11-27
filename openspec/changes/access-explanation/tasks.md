# Tasks

Реализация ведётся скилом `tdd`: сначала тест, затем код.

## 1. Домен

- [x] 1.1 В `src/domain/access.ts` добавить `explainAccess(config, query)` и перевести `calculateAccess` на неё; тесты в `src/domain/explain-access.test.ts` (прежний `access.test.ts` не меняется): прямой и групповой источники, `pending`, `expired`, `revoked` при действующем интервале, отзыв позже окончания (`expired`), постоянное разрешение, чужие разрешения не попадают, пара без разрешений, `sources` равен строкам `active`, порядок прямые перед групповыми; все прежние тесты проходят

## 2. Хук

- [x] 2.1 В `src/app/index.ts` добавить `explainAccess(userId, serviceId, moment)` и реэкспорт типов; тест в `src/app` на перевод локального момента и на то, что конфигурация и `localStorage` не меняются

## 3. Экран

- [x] 3.1 В `src/components/App.tsx` показать блок `access-explanation` со строками `explanation-item-<id>` и `data-status`, подписями источника и статуса и текстом «Разрешений для этой пары нет»; тесты в `src/components/AccessExplanation.test.tsx`: блок скрыт без пары, все четыре статуса, отзыв прямого при действующей группе, согласованность с `access-result` на всех парах и нескольких моментах, прежний формат конфигурации

## 4. Документация и спецификация

- [x] 4.1 В `docs/product.md` описать сценарий объяснения доступа; проверить `npx @fission-ai/openspec validate --all --strict`

## 5. Итоговая проверка

- [x] 5.1 Пройти `npm run typecheck`, `npm test`, `npm run lint`, `npm run lint:arch`, `npm run build`, `npm run test:coverage`: все с кодом 0

## Workflow follow-up

- Независимое ревью скилом `review-diff` в отдельной сессии, отчёт в `docs/reviews/access-explanation.md`.
- Архивировать изменение (`/openspec-archive-change`) после ревью.
