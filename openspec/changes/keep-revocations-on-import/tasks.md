# Tasks

Реализация ведётся скилом `tdd`: сначала тест, затем код.

## 1. Операция переноса отзывов

- [x] 1.1 В `src/app/permissions.ts` добавить `carryOverRevocations(current, imported)`; тесты в `src/app/permissions.test.ts`: перенос при полном совпадении, нет переноса при ином сервисе, субъекте или интервале, более ранний из двух моментов, нет отзыва в текущей конфигурации (та же ссылка), остальные разрешения и списки равны, исходные объекты целы

## 2. Импорт

- [x] 2.1 В `src/app/index.ts` применить операцию в `importJson` только после успешной проверки; тесты в `src/components/Permissions.test.tsx`: файл до отзыва, тот же файл без отзыва, файл с ошибкой

## 3. Итоговая проверка

- [x] 3.1 Пройти `npm run typecheck`, `npm test`, `npm run lint`, `npm run lint:arch`, `npm run build`, `npm run test:coverage`, `npx @fission-ai/openspec validate --all --strict`: все с кодом 0
