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

### Крок 3.6 — Анімований SVG (D2 steps)
- Дата: 2026-07-03
- Виконано: `render.SVGAnimated(d, flow, opts)` — рендерить кожен кадр
  окремо, збирає їх у один SVG через `d2renderers/d2animate.Wrap`
  (@keyframes opacity-анімація, той самий механізм, що й `--animate-
  interval` у D2 CLI). Ключовий нюанс: `RenderOpts.MasterID` (хеш
  діаграми) треба виставити ДО рендеру будь-якого кадру — інакше
  `d2svg.Render` генерує кожен кадр як окремий самостійний `<svg>` з
  власною XML-декларацією, і після вкладення `Wrap`-ом виходить
  невалідний XML (спіймано тестом через `encoding/xml.Decoder`, не лише
  візуально). `dc render --flow X --animate -o out.svg`; `--steps` і
  `--animate` взаємовиключні, обидва вимагають `--flow`.
- Коміт: `b6466a4`
- AC: вивід містить `<svg`, `@keyframes`, `animation:` і успішно
  парситься `encoding/xml.Decoder` (тест) ✅; вручну згенеровано
  анімований SVG для flow `auth-system` — 6 keyframe-блоків, валідний
  XML (перевірено `python3 -c "import xml.etree..."`) ✅.

### Крок 3.7 — Позначка вузлів із під-діаграмою (`details`)
- Дата: 2026-07-03
- Виконано: вузли з `details` отримують суфікс `" ⊞"` у D2/SVG/Mermaid.
  У D2/SVG додатково `style.double-border: true` + нативний D2-атрибут
  `link:` на шлях SVG під-діаграми (`DetailsSVGPath` замінює
  `*.dc.yaml` → `*.svg`, відносно файлу, де оголошено `details`) — D2
  сам обгортає такий shape у `<a href>` в SVG-виводі. У Mermaid —
  директива `click <id> "<path>.svg"` поряд із суфіксом у label.
- Коміт: `f22e261`
- AC: golden D2/Mermaid оновлено — змінився лише `auth-system.*`
  (єдиний приклад з `details`); `oauth-detail`/`payment-processing`
  (без `details`) побайтово незмінні — регресії нема ✅; SVG
  `auth-system` містить рівно один маркер `⊞` і обгортає `OAuthProvider`
  у `<a href="./oauth-detail.svg"` ✅; SVG `payment-processing` (без
  `details`) не містить ні маркера, ні `<a href` ✅.

### Крок 3.8 — Готовий CI-рецепт для користувачів
- Дата: 2026-07-03
- Виконано: `.goreleaser.yml` — збірка `dc` для linux/darwin/windows ×
  amd64/arm64 (6 платформ, CGO disabled). `docs/ci.md` описує рецепт і
  адаптацію в зовнішньому репозиторії. `.github/workflows/
  diagrams.example.yml` — робочий (не заглушка) приклад для
  `examples/*.dc.yaml` цього репозиторію: build → validate → render SVG
  → context → upload artifact, лише команди `dc`, реалізовані в
  попередніх кроках.
- Коміт: `0f0f323`
- AC: `goreleaser build --snapshot --clean` зібрав усі 6 бінарників
  (linux/darwin/windows × amd64/arm64, ≥4 з плану) ✅; кроки
  example-workflow прогнані локально вручну проти `examples/*.dc.yaml` —
  усі 6 вихідних файлів (3 SVG + 3 markdown) успішно згенеровані ✅.

**Фаза 3 завершена.**

## Фаза 4 — Layout-файл і стабільні позиції

### Крок 4.1 — Формат layout
- Дата: 2026-07-03
- Виконано: `docs/format.md` доповнено секцією про
  `<name>.layout.json` — `{ views: { <view>: { positions: { <nodeId>:
  {x,y} } } } }`, поруч із ядром діаграми, не частина `*.dc.yaml`.
  Відсутній у layout id → автолейаут; зайвий id у layout → warning, не
  помилка. `schema/layout.schema.json` (draft 2020-12).
- Коміт: `478099d`
- AC: формат задокументовано ✅; JSON Schema додано, перевірено вручну
  через `ajv-cli` (валідний приклад проходить, зіпсований — падає з
  очікуваною `required` помилкою на `y`) ✅.

### Крок 4.2 — Рендер з урахуванням layout
- Дата: 2026-07-03
- Виконано: `internal/layout` (Load/Save/PathFor/Positions/
  UnknownNodeWarnings). **Відхилення від плану** — D2 `top`/`left` не
  консумуються жодним OSS layout-движком у бібліотеці, лише
  пропрієтарними plugin'ами Terrastruct (див. `docs/deviations.md`,
  крок 4.2); замість цього `render.compileD2Positioned` вручну
  відтворює internal pipeline `d2lib.Compile` і перезаписує
  `obj.TopLeft` між layout та export. `render.ComputedPositions` читає
  позиції з `d2target.Diagram.Shapes` після звичайного автолейауту (для
  `--write-layout`). CLI: `dc render` автопідхоплює
  `<name>.layout.json` (або `--layout-file`), `--write-layout` рахує й
  зберігає позиції.
- Коміт: `54ab06f`
- AC: тест — вузол, зафіксований у layout (Gateway → x:500,y:700),
  опиняється в SVG у межах ±5px ✅; `--write-layout` → повторний рендер
  (з тими самими обчисленими позиціями) дає побайтово ідентичний SVG
  (тест + вручну: `--write-layout` створює sidecar, наступний звичайний
  рендер підхоплює його автоматично і дає identical SVG; зайвий id у
  layout друкує warning, exit 0) ✅.

**Фаза 4 завершена.**

## Фаза 5 — Web-редактор (TypeScript)

### Крок 5.1 — Go→WASM валідатор
- Дата: 2026-07-03
- Виконано: `cmd/wasm/main.go` (build tag `js && wasm`, тому `go build
  ./...`/`go vet ./...` на хості мовчки його пропускають) експортує
  глобальну JS-функцію `validate(yamlString) -> errors[]`. Додано
  `internal/parser.ParseString` (декодує YAML без файлової системи) і
  `internal/validate.ValidateString` (структурні правила DC001-DC005/
  DC007/DC008 без обходу `details` — нема файлової системи, щоб іти по
  референсах). `Makefile`: `make wasm` збирає `web/public/dc.wasm` і
  оновлює `web/public/wasm_exec.js`; `make wasm-test` додатково прогонає
  `web/scripts/test-wasm.cjs`.
- Коміт: `dcb1fea`
- AC: `web/public/dc.wasm` збирається `make wasm` ✅; JS-тест (Node +
  `wasm_exec.js`) — `payment-processing.dc.yaml` → 0 помилок,
  `dc004_flow_no_link.dc.yaml` → `DC004` ✅ (`make wasm-test` пройшов
  зелено).

### Крок 5.2 — Скелет застосунку
- Дата: 2026-07-03
- Виконано: Vite + React 19 + TypeScript у `web/` (scaffold через
  `create-vite`). `parseDiagram.ts` (js-yaml + мінімальна перевірка
  форми), `wasmValidate.ts` (завантажує `public/dc.wasm` через клас `Go`
  з `public/wasm_exec.js`, підключений як звичайний `<script>` у
  `index.html`), `layout.ts` (elkjs, layered/top-down), `DiagramView.tsx`
  (SVG-рендер), `App.tsx` (file input + drag&drop, parse → validate →
  layout → render, повідомлення про помилки завантаження/валідації без
  падіння застосунку).
- Коміт: `d11fc70`
- AC: `npm run build` без помилок ✅; `npm test` (vitest: parseDiagram,
  layout, App-смоук з замоканим `wasmValidate`) — 8/8 зелено ✅;
  Playwright (`npm run test:e2e`, chromium встановлено через `npx
  playwright install`) відкриває `examples/auth-system.dc.yaml` через
  справжній file input проти `vite preview` і бачить усі 5 вузлів і 4
  ребра ✅.
- Нюанс (не відхилення від плану, технічна деталь): `playwright.config.ts`
  мусив використати `http://localhost:4173`, а не `127.0.0.1:4173` — `vite
  preview` на цій машині слухає лише IPv6-loopback для "localhost", тож
  IPv4-літерал не з'єднувався і `webServer` очікування зависало.

### Крок 5.3 — Drag & drop → layout.json
- Дата: 2026-07-03
- Виконано: `src/layoutFile.ts` дзеркалить `internal/layout` (Go):
  `buildLayoutFile`/`parseLayoutFile`/`layoutFileName`/
  `downloadLayoutFile`. `DiagramView` тепер бере окрему мапу `positions`
  (замість координат прямо з elk-layout) + опційний `onNodeDrag`
  (pointerdown/move/up, координати через `getScreenCTM().inverse()`);
  ребра не перемаршрутизуються після перетягування — той самий
  спрощення, що й у CLI (deviations.md, крок 4.2). `App.tsx` володіє
  станом `positions`, кнопки "Export layout" / "Import layout".
  Застосунок ніколи не переписує відкритий `*.dc.yaml`.
- Коміт: `450fc1d`
- AC: Playwright — перетягнути `Gateway` → експортований JSON відрізняється
  від pre-drag експорту, вихідний YAML побайтово незмінний ✅; експорт →
  reload → import відновлює ту саму позицію ✅; вручну крос-перевірено з
  CLI: перетягнуто в браузері, експортовано layout, підкладено в `dc
  render --layout-file` — позиція в SVG збігається з точністю до
  субпікселя (257.92,301.25 у браузері проти 257,301 у CLI SVG, набагато
  точніше за допуск ±5px) ✅.

### Крок 5.4 — Flow-плеєр
- Дата: 2026-07-03
- Виконано: `flowPlayer.ts` — `resolveFlowSteps(flow, choices)` розкладає
  flow у конкретну послідовність кроків, зупиняючись на першій
  нерозв'язаній гілці (`pendingBranch`) замість вгадування — плеєр
  чекає вибору користувача. `pairKey` дзеркалить Go
  `transpile.pairKey`/DC004 (напрямок кроку може бути зворотним до
  напрямку зв'язку — "response"). `FlowPlayer.tsx` — select flow,
  prev/next/autoplay (тік 1.2s, авто-зупинка на кінці або нерозв'язаній
  гілці), панель note, кнопки Then/Else. `DiagramView` — активний крок
  отримує найяскравіший акцент + `<animateMotion>` маркер уздовж ребра
  (реверс шляху, якщо напрямок кроку зворотний до зв'язку), відвідані —
  приглушений акцент.
- Коміт: `40b1743`
- AC: unit-тести `resolveFlowSteps` (звичайний flow, зупинка на гілці,
  продовження по each arm) ✅; Playwright — вибір flow `auth-system` і
  3× "next" → перші 2 ребра `visited`, 3-тє `active`, панель показує
  note 3-го кроку, маркер присутній ✅; autoplay проходить 6-кроковий
  flow до кінця, кнопка "Next" стає disabled, "Autoplay" повертається в
  стан очікування ✅.

### Крок 5.5 — Drill-down навігація по `details`
- Дата: 2026-07-03
- Виконано: `FlowPlayer` став контрольованим (`state`/`onChange`), щоб
  прогрес плеєра можна було зберігати per-рівень. `App.tsx` тримає
  `stack: DiagramLevel[]` (fileName, diagram, layout, positions, помилки
  валідації, flowPlayerState) замість плоского стану; подвійний клік по
  вузлу з `details` додає рівень у стек; клік по некінцевій крихті
  обрізає стек — тривіально зберігає стан попередніх рівнів. Оскільки
  браузерний file input не може прочитати довільний відносний шлях на
  диску, `details` резолвиться проти in-memory `virtualFS` (мапа
  basename → текст), заповненої з файлів, обраних РАЗОМ (multi-select /
  drop папки) — якщо референс не входить у вибірку, показується
  нефатальна помилка `drill-error`, поточна діаграма лишається.
  `DiagramView` — вузли з `details` отримують подвійну рамку + суфікс
  `" ⊞"` в лейблі, подвійний клік передає вузол наверх.
- Коміт: `2fd6df3`
- AC: Playwright — вузол з `details` маркований, інші ні (і
  details-вільна діаграма має нуль маркерів) ✅; подвійний клік відкриває
  `oauth-detail`, breadcrumbs показує обидва рівні, повернення по першій
  крихті відновлює позицію, перетягнуту ДО заходу в under-діаграму
  (порівняно через експортований layout JSON, а не screen bounding box —
  bounding box "плавав" через зміну висоти flow-player панелі), і
  вибраний flow з прогресом ✅; битий `details`-шлях (файл не відкритий
  разом) → помилка, поточна діаграма лишається ✅.

### Крок 5.6 — Експорти
- Дата: 2026-07-03
- Виконано: `cmd/wasm` отримав другий глобал — `context(yamlString) ->
  string`, `internal/context.Generate(d, false)` на діаграмі, розпарсеній
  через `ParseString` (завжди non-deep — deep-режим потребує файлової
  системи, якої тут нема). `svgExport.ts` — чистий (не React)
  SVG-string-білдер `renderDiagramSVGString` (дзеркалить вигляд
  `DiagramView`: flow-підсвітку, маркер `details`, `animateMotion`) +
  `svgStringToPngBlob` (offscreen `<canvas>`) + `downloadBlob`.
  `flowPlayer.ts` отримав `flowStepFrames` — веб-еквівалент Go
  `transpile.FlowStepFrames`, але на вже розв'язаному (обраними гілками)
  списку кроків. `App.tsx` — кнопки "Export PNG", "Export flow steps
  (zip)" (fflate `zipSync`), "Export AI context (markdown)".
- Коміт: `06f097f`
- AC: PNG-експорт непорожній з коректними PNG-магічними байтами ✅;
  markdown-експорт побайтово ідентичний `dc context
  auth-system.dc.yaml` (виклик реального бінарника `dc` з Playwright-тесту)
  ✅; zip з кроками flow (fflate `unzipSync`) містить рівно
  `step-01..06.png` для 6-крокового OAuth flow, кожен непорожній ✅.

**Фаза 5 завершена.**

## Фаза 6 — Движок канви: міграція на React Flow

### Крок 6.1 — Базовий рендер на React Flow
- Дата: 2026-07-03
- Виконано: додано `@xyflow/react`. `components/rfNodeTypes.tsx` — спільний
  `NodeShell` (handles, лейбл, `⊞`-маркер details, стан
  active/visited через `data-active`/`data-visited`) + 6 тонких
  обгорток-компонентів (`ActorNode, ServiceNode, StorageNode, QueueNode,
  ExternalNode, ComponentNode`), кожен зі своїм `data-node-type` і
  CSS-класом `rf-node--<type>` та відмінною формою (коло, скруглений
  прямокутник, "циліндр", пунктир, крапки, гострий прямокутник);
  `resolveNodeType` — фолбек на `component` для невідомих/custom типів.
  `components/rfEdgeTypes.tsx` — `DcEdge` на `getSmoothStepPath` +
  `EdgeLabelRenderer` для лейблу зв'язку, той самий колірний код
  active/visited, що в SVG-в'ювері. `components/FlowCanvas.tsx` — обгортка
  `<ReactFlow>` (у `ReactFlowProvider`) з `Background`, `MiniMap`,
  `Controls`, конвертацією `Diagram`+`DiagramLayout`+positions у RF
  nodes/edges, `onNodesChange` → той самий колбек `onNodeDrag`, що і
  старий в'ювер (той самий формат `LayoutPosition`). `App.tsx` отримав
  перемикач `Canvas: SVG | React Flow` (кнопка `canvas-toggle`,
  default = SVG) — обидва рендерери співіснують до кроку 6.5, як і
  передбачає план.
- Коміт: (цей крок)
- AC: Playwright `e2e/react-flow-canvas.spec.ts` — перемикання на
  React Flow рендерить усі 5 вузлів (`rf-node-<id>`) і 4 ребра
  `auth-system.dc.yaml`, minimap і controls видимі ✅; unit-тест
  `rfNodeTypes.test.tsx` — кожен з 6 базових типів дає відмінний
  `data-node-type`/CSS-клас ✅; `npm test` (19 тестів) + `npm run build`
  + повний `npx playwright test` (13 тестів) зелені ✅.

### Крок 6.2 — Auto-layout (elkjs) + ручні позиції
- Дата: 2026-07-03
- Виконано: `DiagramLevel` отримав `manualPositionIds: Set<string>` —
  ідентифікатори вузлів, чия позиція виставлена вручну (drag або імпорт
  layout-файлу), на відміну від щойно порахованого auto-layout.
  `onNodeDrag` і `onImportLayout` додають зачеплені id в цей сет.
  Кнопка "Re-layout" (`onRelayout`) перераховує `computeLayout` заново
  і оновлює позиції лише для вузлів, яких нема в `manualPositionIds`
  (та оновлює `layout.edges` для нового routing). Export/import layout
  вже працювали крос-двигунно "з коробки", бо `positions`/`layout`
  живуть у спільному стані рівня, незалежному від обраного canvasEngine
  (`FlowCanvas`/`DiagramView` — лише різні в'юери того самого стану).
- Коміт: (цей крок)
- AC: Playwright `e2e/react-flow-layout.spec.ts` — drag на React
  Flow-канві → "Export layout" містить нові координати, вихідний YAML
  побайтово незмінний ✅; layout, експортований з SVG-канви (той самий
  файл, що в кроці 5.3), імпортується на React Flow-канву і відновлює ту
  саму позицію (крос-перевірка двигунів) ✅; "Re-layout" після імпорту
  лишає імпортований вузол на місці (±1px), тоді як інша перевірка (у
  тому ж файлі) підтверджує, що звичайний export/import цикл на самій
  React Flow-канві теж відтворює позицію точно ✅; `npm test` (19),
  `npm run build`, повний `npx playwright test` (16) зелені ✅.

### Крок 6.3 — Flow-плеєр на React Flow
- Дата: 2026-07-03
- Виконано: перенесення виявилось здебільшого "безкоштовним" — `FlowCanvas`
  вже з кроку 6.1 приймає ті самі `activeStep`/`visitedStepKeys`, що і
  старий SVG-в'ювер, і прокидує їх у `data-active`/`data-visited`
  ребер/вузлів; сам плеєр (`FlowPlayer.tsx`, `flowPlayer.ts`) — спільний
  компонент, не прив'язаний до конкретної канви. Додано лише
  анімований маркер: `DcEdge` рендерить `<circle><animateMotion
  path={path} .../></circle>` поверх активного ребра (аналог
  `<animateMotion>` у старому в'ювері); реверс шляху для "response"-кроків
  (як у SVG-в'ювері) свідомо не перенесено в цьому кроці — маркер завжди
  йде від source до target ребра, незалежно від напрямку кроку
  (зафіксовано нижче в `docs/deviations.md`).
- Коміт: (цей крок)
- AC: Playwright `e2e/react-flow-flow-player.spec.ts` — вибір flow і 3×
  "next" → перші 2 ребра `data-visited`, 3-тє `data-active`, панель
  показує note 3-го кроку, `rf-flow-marker-*` присутній ✅; autoplay
  проходить 6-кроковий flow до кінця, "Next" стає disabled ✅;
  `npm test` (19), `npm run build`, повний `npx playwright test` (18)
  зелені ✅.

### Крок 6.4 — Drill-down по `details` на React Flow
- Дата: 2026-07-03
- Виконано: також здебільшого "безкоштовно" — `App.tsx` вже з кроку 6.1
  передає `onNodeDoubleClick={(node) => void openDetails(node)}` у
  `FlowCanvas` так само, як у `DiagramView`; `openDetails`,
  `virtualFS`-резолюція, стек рівнів і breadcrumbs — спільний код,
  незалежний від `canvasEngine`. `rf-details-marker-<id>` (з кроку 6.1)
  і `data-has-details` на `rf-node-<id>` покрили індикатор ⊞. Змін коду
  не знадобилось — лише тести.
- Коміт: (цей крок)
- AC: ті самі три AC кроку 5.5, підтверджені Playwright
  (`e2e/react-flow-drill-down.spec.ts`, 4 тести) на React Flow-канві:
  маркер лише на вузлі з `details` ✅; подвійний клік відкриває
  `oauth-detail`, breadcrumbs, повернення відновлює позицію (через
  export layout, не bounding box) і прогрес flow-плеєра ✅; битий шлях →
  нефатальна помилка, поточна діаграма лишається ✅; діаграма без
  `details` — нуль маркерів ✅. `npm test` (19), `npm run build`, повний
  `npx playwright test` (22) зелені ✅.

### Крок 6.5 — Видалення старого рендерера
- Дата: 2026-07-03
- Виконано: видалено `components/DiagramView.tsx` і перемикач
  `canvas-toggle`/`canvasEngine` з `App.tsx` — React Flow тепер єдина
  канва. Оскільки PNG/zip-експорти (крок 5.6) вже будувались через
  чистий `svgExport.ts` (не через React-компонент `DiagramView`,
  а напряму з `diagram+layout+positions` стану), вони не потребували
  жодних змін — лише оновлено застарілий doc-коментар, що посилався на
  `DiagramView`. Старі e2e-специфікації (`open-diagram`, `drag-layout`,
  `drill-down`, `flow-player`, `exports`) переписані на нові
  `data-testid` (`reactflow-canvas`, `rf-node-*`, `rf-edge-*`) замість
  дублювання окремими `react-flow-*.spec.ts` файлами (видалені,
  оскільки повторювали вже перенесені перевірки). `App.test.tsx` —
  так само на нові id; `setupTests.ts` отримав no-op полiфіл
  `ResizeObserver` (jsdom його не має, а `@xyflow/react` спостерігає за
  контейнером канви).
- Коміт: (цей крок)
- AC: `grep -rn "DiagramView\|diagram-svg\|canvas-toggle" web/src web/e2e`
  — порожньо ✅; всі AC кроку 5.6 (PNG, zip кроків flow, AI-context
  markdown) проходять на React Flow-канві (`exports.spec.ts`, 3 тести)
  ✅; повна регресія — `npm test` (19), `npm run build`, консолідований
  `npx playwright test` (13 тестів, замінили 22 з дублікатами) зелені;
  `go build/vet/test` і `./dc validate` зелені ✅.

**Фаза 6 завершена.**

## Фаза 7 — Повноцінне візуальне редагування

### Крок 7.1 — Серіалізація: модель → YAML-патчі
- Дата: 2026-07-03
- Виконано: додано залежність `yaml` (eemeli/yaml) v2.9.
  `web/src/yamlPatch.ts` — `applyPatch(text, ops[])`: парсить текст у
  `yaml.Document`, застосовує операції `addNode, updateNode, removeNode,
  addLink, removeLink, addFlowStep, removeFlowStep, renameNodeId` через
  мутації самого `Document` (`seq.add/delete`, `map.set/get`,
  `items.splice`) і серіалізує назад — `Document` зберігає коментарі,
  порядок ключів і форматування незмінених частин "з коробки" (це і є
  CST-патчинг з плану — на рівні публічного Document API бібліотеки, без
  прямого доступу до низькорівневого CST). `renameNodeId` рекурсивно
  проходить `links[]` і `flows[].steps` (включно з `branch.then`/`else`)
  і замінює всі згадки id.
- Коміт: (цей крок)
- AC: `yamlPatch.test.ts` (9 тестів) — по одному unit-тесту на кожну
  операцію (патч валідного документа парситься і містить зміну) ✅;
  golden-тест — документ з коментарями після `addNode` + `removeLink`
  зберігає коментарі та порядок незмінених секцій побайтово ✅;
  `renameNodeId` на `payment-processing.dc.yaml` (з branch) оновлює
  згадки id в links і в обох гілках branch ✅; `npm test` (28),
  `npm run build`, `npx playwright test` (13) зелені; go-регресія
  зелена (модуль поки не підключений до UI — це кроки 7.2+) ✅.

### Крок 7.2 — CRUD вузлів з канви
- Дата: 2026-07-03
- Виконано: `components/Palette.tsx` — 6 draggable-елементів (базові
  типи), `dataTransfer` MIME `application/dc-node-type`. `FlowCanvas`
  отримав `onDropNodeType` (через `useReactFlow().screenToFlowPosition`)
  і `onNodeClick`/`selectedNodeId` (виділення передається через
  `data.isSelected` в `DcNodeData`, не через вбудований `node.selected`
  React Flow — останній конфліктував із подвійним кліком, див.
  `docs/deviations.md`, крок 7.2). `components/PropertiesPanel.tsx` —
  форма label/type/description/tags, кожна зміна одразу викликає
  `updateNode`-патч; кнопка "Delete node". `App.tsx`: `applyOps(ops,
  {manualPosition?})` — застосовує `yamlPatch.applyPatch`, перепарсює
  і перевалідовує текст, перераховує layout (той самий merge-підхід,
  що в "Re-layout" кроку 6.2 — ручні позиції лишаються, решта отримує
  нові auto-layout координати; нова нода відразу позначається manual
  з координатами точки, куди її кинули). `dependents.ts` —
  `findNodeDependents` (links + top-level flow-кроки, що згадують
  вузол; кроки всередині branch-гілок — поза межами каскадного
  видалення, задокументовано як обмеження в deviations.md). Видалення
  вузла з залежностями показує `window.confirm` зі списком, підтвердж
  ення каскадно видаляє flow-кроки (з кінця індексів, щоб не збити
  решту), links і сам вузол. Для тестованості додано прихований
  `data-testid="yaml-source"` textarea з поточним raw YAML (буде
  замінений повноцінною CodeMirror-панеллю в кроці 7.5).
- Коміт: (цей крок)
- AC: Playwright `e2e/node-crud.spec.ts` (4 тести) — drag-and-drop
  палітри → нода на канві й у YAML-стані з валідним id (`service1`) ✅;
  редагування label у панелі → канва й YAML оновлені ✅; видалення вузла
  із залежностями (`AuthService`) → `window.confirm` зі списком
  посилань, підтвердження прибирає вузол і всі його links з YAML ✅;
  видалення вузла без залежностей — без діалогу ✅. Регресія:
  `e2e/drill-down.spec.ts` (подвійний клік) зламалась і була
  полагоджена (див. deviations.md); повний `npm test` (30),
  `npm run build`, `npx playwright test` (17) зелені; go-регресія
  зелена ✅.

### Крок 7.3 — Малювання links + інспектор зв'язків
- Дата: 2026-07-03
- Виконано: хендли на нодах (top=target, bottom=source) вже існували з
  кроку 6.1; `FlowCanvas` отримав `onConnect` → `onConnectNodes(source,
  target)` (React Flow сам не викликає його, якщо з'єднання кинуте не на
  handle — тому "лише між існуючими вузлами" виконується без додаткового
  коду). `components/LinksPanel.tsx` — правий сайдбар зі списком усіх
  links, фільтри за типом і вузлом, hover елемента списку/ребра
  синхронізовані в обидва боки через підняте в `App.tsx` спільне
  `hoveredLinkIndex` (а не локальний стан однієї сторони); клік по
  елементу розгортає inline-редактор (тип, лейбл) і кнопку видалення.
  `yamlPatch.ts` отримав новий op `updateLink` (за індексом у
  `links[]`) — його не було в списку кроку 7.1, бо той список
  описував лише додавання/видалення; редагування існуючого зв'язку
  знадобилось саме тут.
- Коміт: (цей крок)
- AC: Playwright `e2e/links.spec.ts` (3 тести) — протягування хендла
  User→DB створює новий `link` (перевірено і кількістю edge-елементів
  на канві, і вмістом YAML-стану) ✅; кидання з'єднання в порожнє місце
  канви не змінює YAML взагалі ✅; hover елемента списку → ребро отримує
  `data-hovered=true`, видалення зі списку прибирає ребро з канви і з
  YAML ✅. Повна регресія: `npm test` (31), `npm run build`,
  `npx playwright test` (20) зелені; go-регресія зелена ✅.

### Крок 7.4 — Редактор flows
- Дата: 2026-07-03
- Виконано: `yamlPatch.ts` отримав `addFlow` (нова іменована flow з
  порожніми steps), `addBranch` (додає `{branch:{condition, then:[],
  else:[]}}`), `addFlowStep` розширено опційним `target:
  {branchAtIndex, arm}` для запису кроку в then/else-гілку, і
  `updateFlowStep` (правка поля, напр. note, за індексом) — жодного з
  цих чотирьох не було в списку кроку 7.1, вони знадобились саме для
  редактора flows. `components/FlowEditorPanel.tsx` — "New flow"
  (prompt на ім'я → `addFlow`, одразу вибирається у flow-плеєрі і
  вмикається запис), "Start/Stop recording", "Add branch" (prompt на
  умову → `addBranch`, перемикає режим запису на гілку `then`),
  "Switch to else/then", "Finish branch" (повернення до
  верхньорівневого запису), і список кроків поточної flow з
  редагованим note та кнопкою видалення. `FlowCanvas` отримав
  `onEdgeClick` (парсить індекс з `edge.id`); клік по ребру під час
  запису викликає `prompt` на note і додає крок через `addFlowStep`
  (з `target`, якщо триває запис гілки) — клік по неіснуючому ребру
  неможливий, бо ребра рендеряться лише для реальних `links[]`.
  Виявлена й виправлена гонка даних у `applyOps` (кілька швидких
  кліків по ребрах губили проміжні кроки) — див. `docs/deviations.md`,
  крок 7.4.
- Коміт: (цей крок)
- AC: Playwright `e2e/flow-editor.spec.ts` — запис 3 кроків кліками по
  ребрах у порядку User→Gateway→AuthService→OAuthProvider дає flow з
  правильним порядком `from`/`to` у YAML-стані ✅; після запису 0
  помилок валідації (`validation-errors` відсутній, тобто й 0 DC004) ✅;
  записаний flow одразу з'являється у списку flow-плеєра і програється
  (`flow-next` → `Step 1 / 3`) ✅. Unit-тести `yamlPatch.test.ts` — по
  тесту на `addFlow`, `updateFlowStep`, `addBranch`+`addFlowStep` у
  гілку (13 тестів разом) ✅. Повна регресія: `npm test` (34),
  `npm run build`, `npx playwright test` (21) зелені; go-регресія
  зелена ✅.

### Крок 7.5 — YAML-панель з двосторонньою синхронізацією
- Дата: 2026-07-03
- Виконано: додано `codemirror` (meta-пакет із `basicSetup`) +
  `@codemirror/lang-yaml`. `components/YamlPanel.tsx` — неконтрольований
  `EditorView`, змонтований один раз; зміни в редакторі дебаунсяться
  (300ms), перевіряються `js-yaml`-парсингом (синтаксис) і
  `parseDiagram` (мінімальна форма) — лише якщо валідно, викликається
  `onCommit(text)`; інакше показується `yaml-panel-error` з рядком
  (`YAMLException.mark.line`), а канва лишається на попередньому
  валідному стані (просто не викликаємо `onCommit`). Зовнішні зміни
  тексту (з канви/палітри/etc.) синхронізуються назад у редактор через
  `diffRange` — обчислює спільний префікс/суфікс і диспатчить
  CodeMirror-транзакцію лише для змінного діапазону, тому курсор/
  виділення поза ним не збивається (CodeMirror сам мапить selection
  через зміни). `App.tsx` отримав `applyTextReplace(text)` — той самий
  ref/queue механізм, що і `applyOps` (крок 7.4), тож текстові й
  візуальні правки не ганяються за тим самим `levelRef`. Прихований
  `yaml-source` textarea (з кроку 7.2) свідомо залишений як є —
  корисний test-only хук, яким користуються тести попередніх кроків;
  реальний видимий/редагований інтерфейс — тепер `YamlPanel`.
- Коміт: (цей крок)
- AC: Playwright `e2e/yaml-panel.spec.ts` (3 тести) — дописування вузла
  прямо в тексті панелі (через `insertText`, щоб не зіткнутися зі
  smart-indent CodeMirror при `Enter`) додає ноду на канву без
  перезавантаження ✅; додавання ноди з палітри відображається в тексті
  панелі, коментар користувача (`# keep me`) лишається на місці ✅;
  синтаксично зіпсований YAML → канва не змінює кількість вузлів,
  з'являється `yaml-panel-error` ✅. Повна регресія: `npm test` (34),
  `npm run build`, `npx playwright test` (24) зелені; go-регресія
  зелена ✅.

### Крок 7.6 — Live-валідація на канві
- Дата: 2026-07-03
- Виконано: `components/ProblemsPanel.tsx` замінив плоский
  `validation-errors` список — той самий перелік `errors`, але з
  `problems-ok` (нуль помилок) або клікабельним `problems-list`, де
  клік передає повну помилку в `App.tsx`. `applyOps`/`applyTextReplace`
  вже викликали `validateDiagram` після кожної зміни (з кроків 7.1/7.5)
  — "дебаунс" для канви фактично природний (одна зміна = один виклик),
  а для YAML-панелі — 300ms дебаунс уже реалізований у кроці 7.5;
  окремий загальний дебаунс не знадобився. `onSelectProblem` —
  евристика без структурованих посилань від валідатора (`ValidationError`
  має лише file/line/code/message): шукає серед `error.message` id
  існуючого вузла (працює для DC004 `flow step X -> Y has no backing
  link`, де X/Y — реальні id) або назву flow; якщо знайдено вузол —
  виділяє його (`selectedNodeId`) і просить `FlowCanvas` зробити
  `fitView` на нього; для flow — вибирає її в flow-плеєрі; інакше —
  переміщує курсор/виділення на `error.line` у `YamlPanel`. Обидва
  компоненти отримали `focusNonce`, що інкрементується при кожному
  кліку, щоб повторний клік на той самий елемент так само спрацьовував.
- Коміт: (цей крок)
- AC: Playwright `e2e/problems-panel.spec.ts` (3 тести) — видалення
  зв'язку `AuthService -> OAuthProvider` через YAML-панель (через
  test-only `__cmView`-хук, бо CodeMirror віртуалізує рядки поза
  екраном — симуляція кліків/клавіш углиб документа ненадійна)
  автоматично позначає DC004 у Problems без жодних кнопок ✅; клік по
  помилці центрує канву на вузлі "AuthService", який вона називає
  (властивості-панель відкривається на ньому) ✅; валідний документ →
  `problems-ok`, порожній `problems-list` ✅. Повна регресія: `npm test`
  (34), `npm run build`, `npx playwright test` (27) зелені; go-регресія
  зелена ✅.

### Крок 7.7 — Undo/Redo
- Дата: 2026-07-03
- Виконано: `App.tsx` — `historyRef: {past: string[]; future: string[]}`
  (ліміт 50), `pushHistory`/`resetHistory`/`syncHistoryCounts`
  (останнє — дзеркалить довжини в `historyCounts` state лише для
  disabled-стану кнопок). `applyOps`/`applyTextReplace` штовхають
  попередній `rawText` в історію перед комітом (якщо текст справді
  змінився); `onUndo`/`onRedo` — той самий ref/queue-механізм, що й інші
  мутації, переміщують снепшот між past/future і перебудовують рівень
  так само, як `applyTextReplace`. Історія скидається при відкритті
  нового файлу чи переході між рівнями drill-down (`resetHistory` у
  `openFiles`/`openDetails`/`goToLevel`). Ctrl/Cmd+Z і
  Ctrl/Cmd+Shift+Z перехоплюються на `window` у capture-фазі з
  `stopPropagation` — це не дає вбудованому undo CodeMirror (з
  `basicSetup`) обробити ту саму подію, коли фокус у YAML-панелі, тож
  історія лишається справді єдиною для канви й панелі, як і вимагає
  план.

  Під час тестування знову виявилась (і цього разу стабільно
  відтворювалась) гонка даних із кроку 7.4: `levelRef` оновлювався
  всередині updater-функції `setStack`, а React 18 не гарантує
  синхронного виконання updater'а при батчингу — див. `docs/
  deviations.md`, крок 7.7. Виправлено переносом присвоєння
  `levelRef.current` у тіло `updateCurrentLevel`, синхronно, до виклику
  `setStack`.
- Коміт: (цей крок)
- AC: Playwright `e2e/undo-redo.spec.ts` (2 тести) — додати ноду →
  undo → ноди нема ні на канві, ні в YAML-стані; redo повертає обидва
  ✅; візуальна правка (нода з палітри) і текстова правка (нова нода
  через YAML-панель) відкочуються в правильному зворотному порядку
  однією історією (undo #2 прибирає текстову правку, undo #1 — візуальну;
  redo повертає в тому ж порядку) ✅. Повна регресія (двічі поспіль,
  щоб перевірити відсутність фляки): `npm test` (34), `npm run build`,
  `npx playwright test` (29) зелені обидва рази; go-регресія зелена ✅.

**Фаза 7 завершена.**

## Фаза 8 — Публічний сайт

### Крок 8.1 — Відкриття та збереження файлів
- Дата: 2026-07-03
- Виконано: `src/fileSystemAccess.d.ts` — мінімальні ambient-типи для
  File System Access API (`showOpenFilePicker`/`showSaveFilePicker`/
  `FileSystemFileHandle`/`FileSystemWritableFileStream`) — не входять у
  бандлований DOM lib TypeScript. `nativeFile.ts` —
  `isNativeFsSupported`, `openDiagramFiles` (мульти-вибір, сортує
  вибрані файли на "ядро" і `*.layout.json` за іменем — API не дає
  доступу до несусідніх/невибраних файлів, тому "автопідхоплення"
  реалізовано як одночасний вибір обох файлів, як і в існуючому
  multi-select file input), `writeTextToHandle`, `pickSaveHandle`.
  `App.tsx`: `onOpenNative` (деградує до кліку по прихованому
  `file-input`, якщо API немає), `onSave` (пише в `mainHandle`/
  `layoutHandle`; без `mainHandle` або без API — falls back на
  `downloadBlob`/`downloadLayoutFile`); `savedRawText` на рівні
  дiаграми + `hasUnsavedChanges` — індикатор і `beforeunload`-попередження
  (через ref, щоб не переприв'язувати листенер щорендеру).
- Коміт: (цей крок)
- AC: Playwright `e2e/native-fs.spec.ts` (3 тести) — відкриття через
  фейковий (in-memory) File System Access API (реальний OS-пікер
  недоступний для автоматизації; стандартний спосіб тестування цього
  API), додавання й перетягування вузла, збереження → ядро на "диску"
  (fake store) містить нову ноду, layout збережено окремим файлом з
  позицією ✅; видалення `showOpenFilePicker`/`showSaveFilePicker` →
  Open деградує до file-input, Save — до download, без винятків
  сторінки ✅; індикатор незбережених змін з'являється після редагування
  і зникає після збереження, `beforeunload` дійсно викликає
  `preventDefault` ✅. Повна регресія: `npm test` (34), `npm run build`,
  `npx playwright test` (32) зелені; go-регресія зелена ✅.

