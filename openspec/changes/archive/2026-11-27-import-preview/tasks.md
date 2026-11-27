# Tasks

Реализация ведётся скилом `tdd`: сначала тест, затем код.

## 1. Расчёт различий

- [x] 1.1 В `src/app/import-preview.ts` добавить `buildImportPreview(current, imported)`; тесты в `src/app/import-preview.test.ts`: файл равен конфигурации, выданные, убранные и изменённые разрешения, сохранённый отзыв (`kept`), более ранний отзыв из файла (`changed`), другая выдача под тем же `id`, сводка по пользователям, группам и сервисам, исходные объекты целы

## 2. Хук

- [x] 2.1 В `src/app/index.ts` заменить `importJson` на `startImport`, `importPreview`, `confirmImport`, `cancelImport`; конфигурация и `localStorage` меняются только в `confirmImport`

## 3. Экран

- [x] 3.1 В `src/components/ConfigTransfer.tsx` показать `import-preview` со строками, `import-confirm`, `import-cancel`, `import-status` после подтверждения; тесты в `src/components/ImportPreview.test.tsx`: предпросмотр не меняет расчёт, экспорт и `localStorage`, перезагрузка, подтверждение, отмена, ошибка после предпросмотра, отзыв после экспорта и отзыв при открытом предпросмотре
- [x] 3.2 Прежние тесты импорта дополнить нажатием `import-confirm`

## 4. Спецификация и архив

- [x] 4.1 Дельта `config-transfer`, архив изменения, ревью в `docs/reviews/import-preview.md`

## 5. Итоговая проверка

- [x] 5.1 Пройти `npm run typecheck`, `npm test`, `npm run lint`, `npm run lint:arch`, `npm run build`, `npm run test:coverage`, `npx @fission-ai/openspec validate --all --strict`: все с кодом 0
