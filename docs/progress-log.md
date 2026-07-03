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

## Фаза 1 — Ядро-бібліотека та `dc validate`

Перед стартом фази: уточнено `PLAN.md`/`docs/format.md` — циклічні `details`
референси офіційно не є помилкою, обхід ведеться з множиною відвіданих
файлів (коміт `32c2bfd`).

### Крок 1.1 — Модель і парсер
- Дата: 2026-07-03
- Виконано: `internal/model` — `Diagram, DiagramMeta, Node, Link, Flow,
  StepOrBranch, Step, Branch` з кастомним `UnmarshalYAML` на кожному типі
  для збереження номера рядка (`yaml.Node.Line`) і default `directed: true`.
  `internal/parser.Parse(path)` — читає файл, декодує через `yaml.v3`,
  резолвить `Diagram.Path` у канонічний абсолютний шлях (потрібно для
  майбутнього обходу `details` з множиною відвіданих файлів).
- Коміт: `94a04af`
- AC: unit-тести парсять усі 3 `examples/` без помилок (кількість вузлів,
  назви flows, `details`-референс, branch then/else звірені) ✅; файл із
  синтаксичною помилкою YAML повертає помилку з номером рядка ✅;
  `go test ./... && go vet ./...` — зелені ✅.

### Крок 1.2 — Семантична валідація
- Дата: 2026-07-03
- Виконано: `internal/validate` — вісім правил `DC001`-`DC008` (кожне
  окремою функцією), помилки збираються всі одразу (не fail-fast), кожна
  з `file:line`. `details` обходяться рекурсивно з множиною відвіданих
  файлів (канонічний абсолютний шлях) — кожен файл валідується рівно
  один раз; цикл `A → B → A` не зависає і не дублює помилки.
  9 невалідних фікстур у `internal/validate/testdata/` (по одній на
  кожен код, дві на DC003 — node і link), плюс фікстура з двома
  незалежними помилками (DC001+DC002) і циклічна пара `cyclic_a/cyclic_b`.
- Коміт: `fa8861e`
- AC: ≥8 невалідних фікстур, unit-тест на кожен код ✅ (9 фікстур,
  всі 8 кодів покриті); всі `examples/` валідні без помилок ✅; файл із
  двома незалежними помилками повертає обидві ✅; циклічна `details`-пара
  завершується (тест з таймаутом 2s), exit без зависання, помилка
  всередині B репортиться рівно один раз ✅; `go test ./... && go vet
  ./...` — зелені ✅.

### Крок 1.3 — CLI `dc validate`
- Дата: 2026-07-03
- Виконано: `cmd/dc/main.go` — команда `dc validate <files...>` з
  підтримкою glob (`filepath.Glob`, літеральні шляхи без glob-символів
  проходять як є, щоб відсутній файл дав execution error, а не мовчки
  зникав), людиночитний вивід `file:line [DCxxx] message` + підсумок
  `N/M files OK`, прапорець `--json`. Exit codes: 0 valid, 1 validation
  errors, 2 execution error (execution error має пріоритет над
  validation).
- Коміт: `9312885`
- AC (перевірено вручну): `go build -o dc ./cmd/dc` збирає бінарник ✅;
  `./dc validate examples/*.dc.yaml` → exit 0, `3/3 files OK` ✅;
  `./dc validate internal/validate/testdata/dc004_flow_no_link.dc.yaml` →
  exit 1, вивід містить `DC004` і номер рядка ✅; `./dc validate
  nonexistent.yaml` → exit 2 ✅; `./dc validate --json examples/*.dc.yaml
  | python3 -m json.tool` — валідний JSON ✅.

### Крок 1.4 — CI репозиторію
- Дата: 2026-07-03
- Виконано: `.github/workflows/ci.yml` — на push/PR у `main`: `go build`,
  `go test`, `go vet`, збірка `dc`, `./dc validate examples/*.dc.yaml`.
- Коміт: `1baf1c3`
- AC: локальна симуляція тих самих команд у shell пройшла зелено ✅.

## Фаза 2 — Генератор AI-контексту

### Крок 2.1 — Генератор
- Дата: 2026-07-03
- Виконано: `internal/context.Generate(d, deep)` — markdown: заголовок +
  purpose/audience → Components (тип, label, description, ai_context,
  згадка `details`) → Links (людською мовою `from -> to (type): label`)
  → секція на кожен Flow (нумеровані кроки, branch — відступні
  Then/Else). `deep=true` рекурсивно інлайнить `details` з множиною
  відвіданих файлів (канонічний абсолютний шлях) — кожна під-діаграма
  інлайниться один раз навіть при циклі/повторі.
- Коміт: `3f097d6`
- AC: golden-тести для всіх 3 examples (`internal/context/testdata/golden/`,
  оновлення через `go test -update`) ✅; вивід auth-system містить усі
  5 вузлів, усі links (перевірені мітки), обидва flows, і не містить
  стороннього вузла (`Ghost`) ✅; невалідний файл — перевіряється на
  рівні CLI (крок 2.2).

### Крок 2.2 — CLI-інтеграція
- Дата: 2026-07-03
- Виконано: `dc context <file> [-o out.md] [--deep]` у `cmd/dc/main.go`.
  Спершу `validate.ValidateFile`; якщо є помилки валідації — вони
  друкуються, exit 1, генерація не відбувається. Прапорці парсяться
  вручну (не через `flag.FlagSet`), бо документована форма CLI ставить
  прапорці після позиційного `<file>`, що стандартний `flag` не підтримує.
- Коміт: `3f097d6`
- AC (перевірено вручну): `./dc context examples/auth-system.dc.yaml
  -o /tmp/ctx.md` → файл створено, exit 0 ✅; `./dc context
  examples/auth-system.dc.yaml --deep` містить вузли з `oauth-detail`
  (`OAuthGateway` та ін.) ✅; `./dc context
  internal/validate/testdata/dc004_flow_no_link.dc.yaml` → exit 1,
  друкує помилку валідації, файл не створюється ✅.
