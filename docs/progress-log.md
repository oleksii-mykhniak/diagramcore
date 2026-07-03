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

## Фаза 3 — Рендеринг через D2/Mermaid + CI-інтеграція

Додано залежність `oss.terrastruct.com/d2` (нативна Go-бібліотека, як
зафіксовано в "Загальних рішеннях").

### Крок 3.1 — Транспілятор у D2-текст
- Дата: 2026-07-03
- Виконано: `internal/transpile.ToD2` — мапінг типів на shapes
  (`actor→person`, `storage/queue→cylinder`, `external` — стиль
  `stroke-dash` замість shape), інші типи (в т.ч. `custom_types`) —
  дефолтний rectangle. Directed links → `->`, undirected → `--`, мітки
  в лапках. `dc export <file> --to d2 [-o out]` у `cmd/dc`.
- Коміт: `175ec77`
- AC: golden-тести D2 для всіх 3 examples ✅; вивід додатково
  компілюється через `d2lib.Compile` (dagre layout, реальний D2-компайлер)
  без помилок для всіх 3 ✅.

### Крок 3.2 — Транспілятор у Mermaid
- Дата: 2026-07-03
- Виконано: `internal/transpile.ToMermaid` — `flowchart TD`, вироджений
  експорт без гарантій стилю. `--to mermaid` у `dc export`.
- Коміт: `175ec77`
- AC: golden-тести, вивід починається з `flowchart`, містить усі вузли й
  ребра ✅; `mmdc` (через `npx @mermaid-js/mermaid-cli`) виявився
  доступним у середовищі — усі 3 golden `.mmd` вручну відрендерено в
  валідний SVG без помилок (TODO-заміна з плану не знадобилась) ✅.

### Крок 3.3 — Нативний рендер SVG
- Дата: 2026-07-03
- Виконано: `internal/render.SVG(d, Options{Layout, ThemeID})` —
  `internal/transpile.ToD2` → `d2lib.Compile` → `d2svg.Render`. Обидва
  layout-движки підключені через `LayoutResolver`
  (`dagre → d2dagrelayout.DefaultLayout`, `elk → d2elklayout.DefaultLayout`).
  `log.WithDefault` — щоб внутрішній debug/warn-лог D2 не засмічував
  stderr. `dc render <file> -o out.svg [--layout dagre|elk]` у `cmd/dc`.
- Коміт: `1bb444a`
- AC: unit-тести для обох layout-движків — вивід містить `<svg` і текст
  вузла `Gateway` ✅; вручну перевірено `./dc render
  examples/auth-system.dc.yaml -o /tmp/auth.svg` (і з `--layout elk`) —
  валідний SVG, exit 0, для обох движків ✅.

### Крок 3.4 — Flow: статичне підсвічування
- Дата: 2026-07-03
- Виконано: `internal/transpile.ToD2Flow(d, flow)` — вузли/ребра на шляху
  flow отримують `style.stroke: "#e04b4b"` + `style.stroke-width: 3`,
  решта — `style.opacity: 0.35`. Участь визначається по всіх кроках
  (включно з `branch.then`/`branch.else`), пари вузлів — без урахування
  напрямку (узгоджено з семантикою DC004 "будь-який напрямок валідний").
  `render.Options.Flow`, `dc render --flow "<name>"`. Неіснуюча назва
  flow → exit 1 з переліком доступних.
- Коміт: `d1f7b82`
- AC: SVG для flow відрізняється від базового (byte-diff) і містить
  акцентний колір `e04b4b` ✅ (тест на другому flow `auth-system`, який
  не займає `OAuthProvider` — це навмисно, оскільки перший flow і обидва
  flows в інших прикладах займають усі вузли/ребра, тож не було б
  приглушених елементів для перевірки); неіснуюча назва flow → exit 1 з
  переліком (`./dc render ... --flow nope` перевірено вручну) ✅.

### Крок 3.5 — Flow: покрокова серія кадрів
- Дата: 2026-07-03
- Виконано: `emphasis` у `internal/transpile` отримав третій рівень
  (Current > Path > Muted). `ToD2StepFrame(d, cumulative)` — кроки шляху
  до поточного отримують стиль Path, поточний — яскравіший (stroke-width
  5), решта — muted. `FlowStepFrames(flow)` розкладає flow на кадри: один
  на звичайний Step, один на кожну непорожню гілку branch (then → "a",
  else → "b"); branch трактується як кінець лінійного кумулятивного
  шляху (задокументовано в коментарі — жоден із поточних прикладів не
  має кроків після branch). Кожен кадр завжди рендерить повний набір
  вузлів/ребер (змінюється лише стиль) — тому граф структурно
  ідентичний між кадрами і layout стабільний. `render.SVGSteps` +
  `dc render --flow X --steps -o dir/`.
- Коміт: `d029290`
- AC: для flow з 6 кроків (auth-system) — рівно 6 файлів, усі валідні
  SVG ✅; для flow з branch (payment-processing: 3 steps + then/else) —
  `step-01..03, step-04a, step-04b` ✅; координати вузла `Gateway`
  (x/y з D2-групи, base64 id) ідентичні в усіх 6 кадрах auth-system ✅.
