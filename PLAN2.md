# PLAN2 — Фаза 10: Production-ready UI/UX веб-редактора

Продовження PLAN.md (фази 0–9 виконано — див. `docs/progress-log.md`).
Правила виконання ті самі: розділ «Правила для агента-валідатора» в PLAN.md —
крок закривається лише коли ВСІ AC проходять; після кроку — регресія, commit
`phase10-step<M>: <опис>`, запис у `docs/progress-log.md`; відхилення — у
`docs/deviations.md`.

## Контекст і мета

Редактор функціональний, але виглядає як прототип: 15 рядків CSS, усі стилі
inline із захардкодженими hex, шапка — плоский ряд ~12 кнопок
(`web/src/App.tsx:811-899`; App.tsx — 995 рядків), YAML-панель незгортувана,
кастомні типи вузлів рендеряться як `component`, експорт — лише PNG без
налаштувань (і малює всі вузли прямокутниками, розходячись із канвою),
імпорту draw.io немає.

Мета — production-ready редактор у стилі draw.io.

## Рішення фази (погоджено з власником; не переглядати без згоди)

- **Теми:** світла за замовчуванням + темна, перемикач у View-меню.
  CSS-змінні на `:root[data-theme=light|dark]`, вибір у localStorage `dc.theme`.
- **Меню:** menubar як у draw.io (File/Edit/View/Arrange/Help) + тонкий
  іконковий toolbar. MenuBar — самописний (~200 рядків, ARIA
  menubar/menu/menuitem), без бібліотек меню.
- **Іконки:** `lucide-react`; hand-drawn стиль — `roughjs`. Це дві єдині
  нові runtime-залежності фази.
- **Стиль рендерингу:** окремий від UI-теми вимір — пресети `clean` (дефолт)
  і `sketch` (hand-drawn); зберігається в layout-файлі, застосовується
  однаково на канві та в експорті через спільний shape-реєстр.
- **Текст на канві:** вільні анотації — семантика → у YAML (`notes:`,
  потрапляють в AI-контекст), позиції — у layout. Описи вузлів
  (`description`) можна показувати на канві (View → Show descriptions).
- **Стилі:** фундамент токенів — одним кроком; міграція inline-стилів —
  інкрементально (компонент переводиться на класи в кроці, де його торкаємось).
- **testid-стабільність:** усі наявні `data-testid` зберігаються; правки e2e
  зводяться до «відкрити меню/вкладку перед кліком».
- **Формат:** розширення `custom_types` — назад-сумісне (string АБО object
  `{name, shape?, color?, icon?}`); зачіпає Go + schema + WASM (окремий крок).
- **Імпорти:** `.drawio`/`.xml` + SVG із вбудованим mxfile — семантичний
  best-effort. Generic-SVG та Mermaid — свідомий descope (фіксується в
  `docs/deviations.md`).
- **Інваріант незмінний:** YAML — джерело правди, канва (React Flow) —
  проєкція; імпорти мапляться в обмежену YAML-модель.
- **Дизайн-скіл:** `.claude/skills/design/SKILL.md` — дизайн-система (токени,
  палітра, spacing, типографіка, правила компонентів) для консистентності
  майбутніх агентів.

**Регресія кожного кроку:** `npm test` + `npm run build` у `web/` + цільові
playwright-спеки кроку; для кроку 10.7 додатково `go test ./...`,
`go vet ./...`, `./dc validate examples/*.dc.yaml`, `make wasm && make wasm-test`.
Наприкінці фази — повний `npm run test:e2e`.

---

## Крок 10.1 — Дизайн-токени, теми light/dark, design-skill

`web/src/theme.css`: токени (`--dc-bg`, `--dc-surface`, `--dc-border`,
`--dc-text`, `--dc-text-muted`, `--dc-accent`, `--dc-danger`,
`--dc-flow-active`, `--dc-flow-visited`, `--dc-node-*`, spacing
`--dc-space-1..6`, радіуси, тіні, типографіка) на `:root[data-theme=light]`
(дефолт) і `[data-theme=dark]`. Хук `useTheme` (localStorage `dc.theme`),
тимчасовий перемикач у шапці (переїде у View-меню в 10.3). Прибрати
`color-scheme: light dark` авто-поведінку з `index.css` на користь явної теми.
Захардкоджені hex у `rfNodeTypes.tsx:35`, `rfEdgeTypes.tsx:35` → токени
(svgExport — у 10.6). Створити `.claude/skills/design/SKILL.md`: палітра обох
тем, усі токени, spacing/типографіка, правила («нові компоненти — тільки
CSS-класи + токени, ніяких inline-hex», правила testid, патерни панелей).

**AC:**
- [x] Unit: `useTheme` перемикає `data-theme` і персистить у localStorage; дефолт без збереженого значення — `light`.
- [x] Playwright: перемикач теми міняє computed background-color `body`; після reload тема збережена.
- [x] Вузли/ребра видимі й контрастні в обох темах.
- [x] `grep -rn "#e04b4b\|#e08a4b\|#0066cc" web/src --include="*.tsx"` — порожній.
- [x] `.claude/skills/design/SKILL.md` існує і документує всі введені токени.
- [x] `npm test` + `npm run build` зелені; всі наявні e2e зелені без правок.

## Крок 10.2 — Декомпозиція App.tsx (без візуальних змін)

Розрізати App.tsx на хуки + компоненти зі збереженням поведінки і testid
байт-у-байт: `hooks/useDiagramStack.ts` (stack/levelRef/applyChain/drill-down/
openFiles/openTextAsDiagram), `hooks/useHistory.ts` (undo/redo + гарячі
клавіші), `hooks/useDiagramExports.ts` (onExportPng/Zip/Context/Layout/Share),
`components/AppHeader.tsx` (поточна шапка як є), `components/EditorWorkspace.tsx`
(вміст `<main>`). App.tsx стає композицією. Обережно з
`applyChainRef`/`levelRef` (гонки — див. `docs/deviations.md` кроки 7.4/7.7) —
переїздять у хук цілком, без зміни семантики.

**AC:**
- [x] `web/src/App.tsx` ≤ 200 рядків; жодного нового inline-hex.
- [x] Усі наявні unit-тести зелені **без змін тестів**.
- [x] Повний `npm run test:e2e` зелений **без змін жодної спеки** (доказ стабільності testid'ів і поведінки).
- [x] `npm run build` зелений.

## Крок 10.3 — MenuBar + іконковий Toolbar

Нова шапка: рядок 1 — логотип + MenuBar:
**File**: New, Open, Save, Import layout, Import draw.io (placeholder до
10.10), Export image… (placeholder до 10.9), Export layout, Export flow steps
(zip), Export AI context, Share; **Edit**: Undo, Redo, Delete node;
**View**: Theme light/dark, Grid, Snap to grid, YAML panel, Zoom in/out/Fit,
Fullscreen; **Arrange**: Re-layout, Re-layout all (нова дрібна дія — скидає
manual-позиції); **Help**: Tour, формат/GitHub. Плюс індикатор unsaved.
Рядок 2 — тонкий toolbar з lucide-іконками (undo/redo/zoom in/out/fit/
re-layout/flow-play/fullscreen/theme) + breadcrumbs. Пункти меню несуть старі
testid (`save`, `export-png`, `export-layout`, `layout-input`,
`export-context`, `export-flow-steps-zip`, `share`, `open-native`);
toolbar-іконки — старі `undo`/`redo`/`relayout`. Прихований `file-input`
лишається. Fullscreen — `requestFullscreen` на root. E2e-хелпер
`openMenu(page, 'file')` у `e2e/helpers`; оновити `exports.spec`,
`share-link.spec`, `native-fs.spec`, `drag-layout.spec`; `undo-redo.spec`
не змінюється.

**AC:**
- [x] Playwright: меню File відкривається кліком, закривається Escape/кліком поза; hover по Edit при відкритому File перемикає меню.
- [x] Усі дії старої шапки досяжні через меню/toolbar і працюють (оновлені спеки зелені).
- [x] Клавіатура: стрілки навігують пунктами, Enter активує; ARIA role=menubar/menu/menuitem.
- [x] Шапка стилізована токенами (нуль inline-hex); обидві теми коректні.
- [x] Повна e2e-регресія + `npm test` + `npm run build` зелені.

## Крок 10.4 — Доки: ліва палітра, правий док, статус-бар

Каркас робочої області CSS-grid: **ліворуч** — вузький сайдбар із Palette
(вертикальний список, прев'ю-фігура + назва; testid `palette`/
`palette-item-*` без змін); **центр** — канва на весь простір; **праворуч** —
док із вкладками: *Properties* (PropertiesPanel, testid `properties-panel`
збережено), *Links* (LinksPanel), *Flows* (FlowPlayer + FlowEditorPanel);
**знизу** — статус-бар: індикатор валідації (OK / N problems, клік розгортає
ProblemsPanel поверх статус-бару), лічильник вузлів/зв'язків, zoom. Помилки
load/drill — toast над статус-баром (testid `load-error`/`drill-error`
збережені). E2e-хелпер `openDock(page, 'links'|'flows')`; оновити
`problems-panel.spec`, `links.spec`, `flow-player.spec`, `flow-editor.spec`,
`node-crud.spec`.

**AC:**
- [x] Playwright: канва займає центральну область; drag типу з лівої палітри створює вузол (адаптований `node-crud.spec` зелений).
- [x] Вкладки правого дока перемикаються; hover-синхронізація Links↔канва працює (адаптований `links.spec`).
- [x] Клік по проблемі в розгорнутій панелі фокусує вузол/рядок як раніше (адаптований `problems-panel.spec`).
- [x] Flow-плеєр і запис flow працюють із вкладки Flows (адаптовані спеки).
- [x] Правий док можна згорнути; стан у localStorage `dc.ui.rightDock`.
- [x] Повна e2e-регресія + `npm test` + `npm run build` зелені.

## Крок 10.5 — Колапсибельна YAML-панель + Grid/Snap + персист View

YAML-панель → нижня панель під канвою (на всю ширину, resize-хендл по
висоті), заголовок-кнопка згортає/розгортає; дефолт — розгорнуто (мінімізує
правки `yaml-panel.spec`). Стан: `dc.ui.yamlPanel` (`open|collapsed`) +
`dc.ui.yamlPanelHeight`. View-меню: Grid on/off (React Flow `<Background/>`
у `FlowCanvas.tsx`), Snap to grid (`snapToGrid`/`snapGrid={[10,10]}`),
персист у `dc.ui.grid`/`dc.ui.snap`. Прихований `yaml-source` textarea
лишається (e2e читають YAML-стан через нього — не чіпати).

**AC:**
- [x] Playwright: згорнути YAML-панель → редактор зникає, канва росте; reload → панель лишилась згорнутою; розгорнути → вміст актуальний.
- [x] Двостороння синхронізація YAML↔канва працює після згортання/розгортання (адаптований `yaml-panel.spec`).
- [x] View → Grid off прибирає крапки фону; Snap on: перетягнутий вузол має координати, кратні 10 (перевірка через Export layout).
- [x] Налаштування View переживають reload (localStorage).
- [x] Повна e2e-регресія + `npm test` + `npm run build` зелені.

## Крок 10.6 — Єдиний shape-реєстр: канва + експорт малюють однаково

Новий модуль `web/src/shapes.ts` — єдине джерело геометрії/стилю фігур: для
кожного типу `ShapeSpec { name, renderSvgInner(w, h, style): string }`
(storage — cylinder (еліпси+тіло), actor — коло, queue — dashed rect,
external — dotted + muted fill, service — rounded rect, component —
near-square) + додаткові фігури під custom types/draw.io: `hexagon`,
`diamond`, `ellipse`, `cloud`, `parallelogram`. `rfNodeTypes.tsx`: NodeShell
рендерить SVG-підкладку через `renderSvgInner`, label/handles/маркер ⊞
поверх; стани (active/visited/selected/details) — токенами. `svgExport.ts`:
`renderDiagramSVGString` малює вузли через **той самий** `renderSvgInner`
(замість універсального rect, рядки 61–77) зі `resolveThemeColors()`
(getComputedStyle + статичний fallback-map для vitest/jsdom); кольори
ребер/маркерів — теж із теми. Оновити `rfNodeTypes.test.tsx`,
`svgExport.test.ts`.

**AC:**
- [ ] Unit: для кожного з 6 базових типів `renderSvgInner` дає відмінний SVG; канва і експорт для одного типу використовують один spec (тест викликає обидва шляхи і порівнює геометрію).
- [ ] `exports.spec`: експортований PNG непорожній; SVG містить cylinder-геометрію для storage-вузла.
- [ ] `svgExport.ts` не містить захардкоджених кольорових hex (усе через resolveThemeColors/параметри).
- [ ] Наявні e2e зелені (testid/DOM-структура NodeShell збережені).
- [ ] `npm test` + `npm run build` зелені.

## Крок 10.7 — Формат: стильовані `custom_types` (Go + schema + docs + WASM)

Розширити формат назад-сумісно: елемент `custom_types` — **string АБО
object** `{name (обов'язк.), shape?, color?, icon?}`; `shape` — з реєстру
фігур (базові 6 + hexagon/diamond/ellipse/cloud/parallelogram; невідоме
значення — НЕ помилка, fallback на component — зафіксувати в docs), `color` —
CSS-колір, `icon` — назва lucide-іконки (best-effort, тільки web). Go:
`internal/model/model.go` — `CustomTypes []CustomType`,
`type CustomType { Name, Shape, Color, Icon string }` з `UnmarshalYAML`, що
приймає скаляр (legacy) і мапу; `internal/validate/validate.go:134` →
`t.Name`; `schema/diagramcore.schema.json` — `items: oneOf[string,
object{required:[name]}]`; `docs/format.md` — таблиця нових полів + приклад;
`make wasm` — перезібрати `web/public/dc.wasm`. Перевірити інших споживачів
CustomTypes (context-генератор, transpile).

**AC:**
- [ ] Go unit: обидві форми item'а парсяться; змішаний список теж; DC003 працює для обох форм.
- [ ] `./dc validate examples/*.dc.yaml` — 0 помилок (усі наявні examples валідні без змін); JSON Schema приймає обидві форми, відхиляє object без `name`.
- [ ] `go test ./...` + `go vet ./...` зелені; `make wasm && make wasm-test` зелені; WASM-валідація в браузері приймає діаграму з object-формою.
- [ ] `docs/format.md` оновлено; фікстура зі стильованим custom type додана в `testdata/` або `examples/`.

## Крок 10.8 — Візуали custom_types на канві, в експорті та палітрі

Web-сторона кроку 10.7: `parseDiagram.ts`/`types.ts` — `custom_types`
нормалізується до `CustomTypeDef[]`; `shapes.ts` отримує
`nodeVisual(diagram, nodeType)` → `{shapeSpec, color?, icon?}` (custom без
стилю → component-фігура + нейтральний колір; `resolveNodeType`-fallback у
`rfNodeTypes.tsx:126` замінюється на реєстр). Канва: NodeShell фарбує
підкладку `color`, малює lucide-іконку поруч із label. Експорт: той самий
`nodeVisual` (іконка в SVG-експорті — descope, зафіксувати; фігура+колір —
обов'язково). Палітра: секція "Custom" з типами поточної діаграми
(`palette-item-<type>`), drag створює вузол цього типу. PropertiesPanel:
селект type включає custom types.

**AC:**
- [ ] Unit: діаграма з `custom_types: [{name: cache, shape: hexagon, color: "#f5a623"}]` → вузол типу cache рендериться hexagon із цим кольором і на канві, і в `renderDiagramSVGString`.
- [ ] Playwright: відкрити фікстуру з custom type → у палітрі з'явився пункт; drag на канву створює вузол цього типу, у YAML з'явився `type: cache`, валідація — 0 помилок.
- [ ] Custom type без стилю рендериться як component (fallback-тест, нічого не ламається).
- [ ] `npm test` + `npm run build` + повна e2e-регресія зелені.

## Крок 10.9 — Діалог експорту зображення (PNG/JPG/SVG + налаштування)

`components/ExportDialog.tsx` (модалка, File → "Export image…"; testid
`export-png` мігрує на пункт відкриття діалогу + новий `export-confirm`):
формат PNG/JPG/SVG; scale 1x/2x/4x (розмір canvas × scale, viewBox без змін);
фон — transparent / white / theme (для JPG transparent недоступний, контрол
disabled); "include grid" (SVG `<pattern>` із крапками, як на канві). SVG —
прямий download рядка з 10.6; JPG — `canvas.toBlob('image/jpeg', 0.92)`.
`svgStringToPngBlob` → узагальнити в
`svgStringToRasterBlob(svg, w, h, {scale, background, mime})` (заливка `#fff`
стає параметром). Налаштування персистяться (`dc.ui.exportSettings`);
"Export flow steps (zip)" використовує ті самі налаштування.

**AC:**
- [ ] Playwright: діалог → SVG → скачаний файл починається з `<svg`, містить фігури вузлів; PNG 2x має подвоєні піксельні розміри (decoded image size).
- [ ] PNG з transparent background має альфу; JPG скачується, опція transparent для JPG заблокована.
- [ ] Grid on додає pattern у SVG; off — ні (unit).
- [ ] Адаптований `exports.spec` + повна регресія + `npm test` + `npm run build` зелені.

## Крок 10.10 — Імпорт draw.io

`web/src/drawioImport.ts`: приймає `.drawio`/`.xml`, а також `.svg` із
вбудованим mxfile (атрибут `content` кореневого `<svg>`) — generic SVG чесно
не підтримуємо (повідомлення "only draw.io-exported SVG is supported").
Парсинг: `DOMParser`; payload `<diagram>` — якщо не XML усередині, то
base64 → `fflate.inflateRaw` → `decodeURIComponent`. Мапінг mxCell:
style-рядок → key/value; евристики `shape=cylinder*|couchdb`→storage,
`shape=actor|umlActor`→actor, `shape=cloud`→external, `dashed=1`→queue,
`rounded=1`→service, решта→component (`fillColor` у v1 ігноруємо —
зафіксувати). Vertex: label = value без HTML-тегів, id санітизується до
`[A-Za-z][A-Za-z0-9_]*` (мапа старий→новий, унікальність); geometry →
manual-позиції. Edges → `links` type `request`, label з value; edges на
відсутні вузли відкидаються з підсумком "imported N nodes, M links,
skipped K". Генерація YAML через `yaml`-бібліотеку → відкриття через
`openTextAsDiagram` + позиції; результат обов'язково проходить
WASM-валідацію (0 помилок — інакше показати проблеми, не відкривати мовчки).
File → "Import draw.io…" (`drawio-input`). Фікстури: нестиснений XML,
стиснений, SVG-з-mxfile.

**AC:**
- [ ] Unit: всі 3 фікстури парсяться; стиснений payload розпаковується; кожна евристика shape→type покрита тестом; id-санітизація зберігає зв'язність links.
- [ ] Playwright (нова `drawio-import.spec.ts`): імпорт фікстури → вузли на канві у позиціях з файлу (±5px), `yaml-source` містить очікувані nodes/links, Problems — OK.
- [ ] Імпортована діаграма редагується як звичайна (додати вузол, undo — працює).
- [ ] Битий/чужий файл → людське повідомлення, застосунок не падає.
- [ ] `npm test` + `npm run build` + повна регресія зелені.

## Крок 10.11 — Формат: текстові анотації (notes) + показ description

Вільний текст на канві (як підписи "Trigger refresh"/заголовки на типових
архітектурних діаграмах) — це семантика, тому в YAML (і в AI-контекст),
а позиції — в layout.

Формат: top-level `notes: [{id, text, target?}]` (`target` — необов'язкове
посилання на вузол/зв'язок; валідація: унікальні id, target існує). Go:
`internal/model` + validate + `schema/diagramcore.schema.json` +
`docs/format.md` + `make wasm`; `dc context` включає notes у markdown.
Web: канва рендерить note як borderless текст-вузол (перетягується,
позиція → layout.json секція `notes`); додавання — з палітри ("Text") або
Edit → Add note; редагування тексту — подвійний клік / PropertiesPanel;
експорт (SVG/PNG/JPG) малює notes тим самим shape-реєстром. Додатково:
View → "Show descriptions" — під label вузла показується `description`
другим рядком (muted, обрізаний), і в експорт-діалог опція "include
descriptions".

**AC:**
- [ ] Go unit: notes парсяться, валідація target/унікальності id працює; `dc context` містить текст notes; наявні examples валідні.
- [ ] `go test ./...` + `go vet ./...` + `make wasm && make wasm-test` зелені; `./dc validate examples/*.dc.yaml` — 0 помилок.
- [ ] Playwright: додати note з палітри → з'явився в YAML (`yaml-source`), перетягнути → позиція в layout.json, текст редагується; undo працює.
- [ ] Note присутній в SVG-експорті; "Show descriptions" показує/ховає описи на канві та в експорті.
- [ ] `npm test` + `npm run build` + повна регресія зелені.

## Крок 10.12 — Пресети стилю рендерингу (clean / sketch)

Стиль того, як намальовано все (вузли, ребра, текст) — окремо від UI-теми.
`RenderStyle` пресети: **clean** (дефолт, поточний вигляд на токенах) і
**sketch** (hand-drawn: «хиткі» контури через `roughjs` (~10KB gzip, друга і
остання нова залежність фази), рукописний шрифт — self-hosted subset woff2,
без зовнішніх CDN). `shapes.ts`: `renderSvgInner(w, h, style)` отримує
`renderStyle` — і канва, і експорт малюють через один код, тож стиль
однаковий скрізь. Вибір: View → "Diagram style"; зберігається у layout-файлі
(`renderStyle`), тож share-link і `.layout.json` переносять вигляд;
експорт-діалог показує поточний стиль. Архітектура пресетів відкрита —
додавання третього стилю = новий об'єкт у реєстрі стилів (зафіксувати
патерн у `.claude/skills/design/SKILL.md`).

**AC:**
- [ ] Unit: для одного вузла clean і sketch дають різний SVG; sketch-геометрія детермінована при фіксованому seed (стабільні тести).
- [ ] Playwright: View → Diagram style → sketch міняє вигляд канви; reload через share-link зберігає стиль; SVG-експорт містить sketch-контури.
- [ ] Пресет застосовується до всіх фігур (базові 6 + custom shapes) і ребер; обидві UI-теми сумісні з обома пресетами.
- [ ] `npm test` + `npm run build` + повна регресія зелені.

## Крок 10.13 — Полірування, StartScreen/Tour, фінальна регресія

StartScreen і Tour перестилізувати токенами під новий каркас (Tour оновити
під menubar/доки); прибрати залишкові inline-hex по всьому `web/src`
(grep-чистка); доповнити `.claude/skills/design/SKILL.md` фінальним станом
(доки, меню, діалоги); оновити README/`docs/format.md`; запис у
`docs/progress-log.md` про завершення фази; Mermaid-імпорт зафіксувати в
`docs/deviations.md` як свідомий descope (кандидат на наступну фазу).

**AC:**
- [ ] `grep -rn "style={{[^}]*#[0-9a-fA-F]" web/src` — порожній (усі кольори — токени).
- [ ] Tour проходить end-to-end у новому UI (playwright).
- [ ] Повний `npm run test:e2e` зелений; smoke-набір — в обох темах; `npm test`, `npm run build`, `go test ./...`, `go vet ./...`, `./dc validate examples/*.dc.yaml` зелені.
- [ ] `.claude/skills/design/SKILL.md` актуальний (перелік токенів збігається з `theme.css`).

---

## Порядок і ризики

10.1–10.2 — фундамент без зміни поведінки (найдешевше відкотити) →
10.3–10.5 — реструктуризація UI дрібними незалежними шматками (кожен ламає
обмежений набір спек, який чинимо в тому ж кроці) → 10.6 — передумова для
10.8, 10.9, 10.11, 10.12 → 10.7 — перший крок із Go/форматом (ізольований,
назад-сумісний) → 10.9 → 10.10 — найризиковіший за обсягом евристик →
10.11 — другий формат-крок (notes, назад-сумісний) → 10.12 — стилі
рендерингу (чиста надбудова над shape-реєстром) → 10.13 — фініш.
Нові залежності: **`lucide-react` + `roughjs`** (обидві маленькі,
tree-shakeable, без транзитивного хвоста).
