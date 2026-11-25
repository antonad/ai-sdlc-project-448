# Симулятор политик доступа

[![hexlet-check](https://github.com/antonad/ai-sdlc-project-448/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/antonad/ai-sdlc-project-448/actions)

Научитесь вести разработку с ИИ-агентом по спецификации и доводить каждое изменение до проверенного выпуска.

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-sdlc
Как это должно работать: https://files.hexlet.app/a/op3ue1

## О приложении

Браузерный симулятор: выбираешь сотрудника и сервис, а приложение отвечает, есть ли доступ и через какие источники (прямое разрешение или группа). Разрешения можно выдавать и снимать, конфигурацию можно экспортировать и импортировать в JSON. Данные хранятся только в браузере (`localStorage`), серверной части нет.

## Стек

- TypeScript, React 19, Mantine 9
- Vite 8, Vitest 5 (jsdom, Testing Library)
- oxlint, oxfmt, ast-grep (архитектурные правила в `rules/`)

## Установка

Нужны Node.js 26 (как в CI; на 24 тоже работает) и npm. Переменные окружения не требуются.

```bash
git clone https://github.com/antonad/ai-sdlc-project-448.git
cd ai-sdlc-project-448
npm ci
```

## Использование

```bash
npm run dev        # dev-сервер, http://localhost:8080
npm run build      # проверка типов и сборка в dist/
npm run preview    # просмотр сборки на порту 8080
```

Проверки (те же запускает CI):

```bash
npm test           # тесты
npm run test:coverage  # тесты с отчётом о покрытии и порогами
npm run lint       # oxlint и проверка формата (npm run lint:fix исправляет)
npm run lint:arch  # архитектурные правила ast-grep
```

Доступны и цели `make`: `make setup`, `make dev`, `make test`, `make lint`, `make lint-arch`.

## Документация

- [Продукт](docs/product.md): цели, заказчик Марина, сценарии, что вне рамок.
- [Архитектура](docs/architecture.md): слои `domain`, `app`, `components` и правила импортов.
- [Требования безопасности](docs/security-requirements.md): четыре ограничения, которым должен соответствовать любой дифф.

## Разработка с ИИ-агентом

Инструкции для агента лежат в [CLAUDE.md](CLAUDE.md), проектные скилы в `.claude/skills/` (`verify`, `review-diff`, `add-arch-rule`). Шаблон описания PR: `.github/pull_request_template.md`.

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
