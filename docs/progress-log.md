# Журнал виконання плану

Кожен запис — один завершений крок з PLAN.md: що зроблено, коли, яким комітом.
Відхилення від плану записуються окремо в `docs/deviations.md` і лише
згадуються тут посиланням.

## Фаза 0 — Spike: формат на реальних прикладах

### Крок 0.1 — Ініціалізація репозиторію
- Дата: 2026-07-03
- Виконано: `git init`, `go mod init github.com/oleksii94/diagramcore`,
  `.gitignore` (Go + node/web), `docs/concept.md` (написаний на основі
  розділу "Загальні рішення" та мети проєкту з PLAN.md — окремого
  концепт-документа в проєкті не існувало, власник підтвердив цей підхід).
- Коміт: `027b63e`
- AC: `git log` містить initial commit ✅; `go build ./...` без помилок ✅.

### Крок 0.2 — Специфікація формату v0
- Дата: 2026-07-03
- Виконано: `docs/format.md` — описано `diagram`, `nodes`, `links`, `flows`
  (Step/Branch), базові типи вузлів, семантику валідності flow-кроку
  (включно з правилом "зворотний хід по directed-ребру = response"),
  правило відносного шляху для `details`.
- Коміт: `32cb4d9`
- AC: усі секції описані з типом/обов'язковістю/default ✅; семантика flow
  (link має існувати, зворотний напрямок = response) описана ✅; правило
  відносного шляху `details` описано ✅.

### Крок 0.3 — Три реальні приклади
- Дата: 2026-07-03
- Виконано: `examples/auth-system.dc.yaml` (5 вузлів, 2 flows, референс `details`
  на oauth-detail), `examples/oauth-detail.dc.yaml` (4 вузли, під-діаграма),
  `examples/payment-processing.dc.yaml` (6 вузлів, flow з `branch`).
- Валідність YAML перевірена через `ruby -ryaml` (Python `pyyaml` недоступний
  у середовищі — externally-managed, встановлення відхилено; Ruby є в системі
  і дає еквівалентну перевірку синтаксису).
- Коміт: `4b13cfc`
- AC: 3 файли ≥4 вузли кожен ✅; auth-system 2 flows ✅; payment-processing
  використовує branch ✅; auth-system використовує details ✅; синтаксично
  валідний YAML ✅; відповідність format.md (без невідомих полів) ✅.

### Крок 0.4 — JSON Schema
- Дата: 2026-07-03
- Виконано: `schema/diagramcore.schema.json` (draft 2020-12), покриває всі
  секції з format.md. Перевірено через `npx ajv-cli --spec=draft2020`
  (YAML→JSON конвертація через ruby), всі 3 examples — valid.
  Зіпсована фікстура `testdata/invalid_missing_node_id.dc.yaml`
  (вузол без `id`) — invalid, помилка вказує на `required: id`.
- Коміт: `9e64578`
- AC: усі examples проходять валідацію ✅; зіпсований файл не проходить ✅.
