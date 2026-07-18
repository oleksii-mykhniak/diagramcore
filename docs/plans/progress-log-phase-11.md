# Progress log — фаза 11 (PLAN3.md)

Журнал фаз 0–10 (PLAN.md, PLAN2.md) — `docs/plans/progress-log-phases-0-10.md`.

Формат запису: `## phase11-step<M> — <опис>` + дата, коміт, що зроблено,
відхилення (якщо були — детально в `docs/deviations.md`).

---

## Підготовка — 2026-07-04

- Створено PLAN3.md (фаза 11: функціональне ядро редактора — перф drag,
  YAML у док, resize, parent-вкладеність, стилі, ребра, вкладки, автосейв).
- Виконані плани перенесено в `docs/plans/` (PLAN.md, PLAN2.md, старий
  progress-log), CLAUDE.md оновлено.
- Рішення фази погоджено з власником (стилі — гібрид; вкладеність —
  `parent:`; навігація — вкладки+breadcrumbs; схований лише draw.io import).

## phase11-step1 — Перф: плавний drag без глобального перерендеру — 2026-07-04

- `FlowCanvas` перейшов на `useNodesState` (некеровані вузли React Flow):
  `allNodes`, похідні з пропсів (діаграма/лейаут/позиції/вибір/т.д.), як і
  раніше рахуються мемоізовано і синхронізуються в внутрішній RF-стан
  через `useEffect`; сам `useEffect` більше не зачіпається під час драгу,
  бо пропси (`positions`) під час руху миші не змінюються — вони йдуть
  напряму у внутрішній стан React Flow через його власний
  `onNodesChange`.
- Коміт у документ-рівень (`updateCurrentLevel`) тепер відбувається один
  раз — у новому колбеку `onNodeDragStop` (перейменовано з `onNodeDrag` в
  усьому ланцюжку `FlowCanvas → EditorWorkspace → App`), а не на кожен
  `mousemove`. Ноутс (`onNoteDrag`) так само комітяться лише на dragStop.
- Всі експортовані node/edge-компоненти (`ActorNode`..`CustomNode`,
  `NoteNode`, `DcEdge`) обгорнуті в `memo()`.
- Новий тест `FlowCanvas.test.tsx`: мокає `<ReactFlow>`, щоб напряму
  дьоргати `onNodesChange`(dragging:true)/`onNodeDragStop` і перевіряє, що
  перерендер батьківського компонента відбувається рівно один раз (на
  dragStop), а не на кожен проміжний рух.
- Регресія: `npm test` (64/64), `npm run build`, повний
  `npx playwright test` (59/59, включно з `drag-layout.spec.ts` і
  `notes.spec.ts`) — усе зелене.
- Commit: `phase11-step1: перф — некеровані вузли RF, коміт позиції на dragStop`.

## phase11-step2 — YAML у правий док — 2026-07-04

- `RightDock` отримав 4-ту вкладку `yaml` (тип `RightDockTab` розширено);
  ширший (420px замість 300) коли активна ця вкладка — CodeMirror
  потребує більше простору, ніж списки Properties/Links/Flows.
- Нижня панель у `EditorWorkspace` (toggle-кнопка, resize-handle,
  висота, `yamlPanelOpen/Height` державні пропси) повністю видалена;
  `YamlPanel` тепер рендериться як `yamlContent` дока. Відповідний стан
  (`dc.ui.yamlPanel`, `dc.ui.yamlPanelHeight`) прибрано з
  `useViewSettings`; View-пункт меню "YAML panel: shown/hidden" видалено
  з `AppHeader` (керування — тільки через клік по вкладці/колапс дока,
  як і Links/Flows).
- Вибір вузла (клік по канві чи Problems-панель) як і раніше перемикає
  док на Properties — це коректно "виштовхує" з вкладки YAML при
  створенні/виборі вузла (підтверджено в e2e).
- e2e: доданий `'yaml'` у `helpers/dock.ts`; усі спеки, що раніше читали
  `yaml-panel` напряму (`yaml-panel.spec.ts`, `undo-redo.spec.ts`,
  `problems-panel.spec.ts`), тепер спершу викликають
  `openDock(page, 'yaml')`. Тест колапсу нижньої панелі в
  `view-settings.spec.ts` замінено на тест вкладки+колапсу дока.
- Регресія: `npm test` (64/64), `npm run build`, повний
  `npx playwright test` (59/59).
- Commit: `phase11-step2: YAML-панель у правий док`.

## phase11-step3 — Сховати draw.io import + локальний автосейв IndexedDB — 2026-07-04

- `web/src/featureFlags.ts`: `drawioImport: false`. Пункт меню "Import
  draw.io…" (і його input) рендериться умовно в `AppHeader`; importer і
  його unit-тести не займані. Відповідні e2e (`drawio-import.spec.ts`)
  обгорнуті в `test.describe.skip` з поясненням (деталі —
  `docs/deviations.md`, крок 11.3) — вмикання флагу назад одразу
  повертає їх до роботи.
- Новий модуль `web/src/localAutosave.ts`: тонка обгортка над
  IndexedDB (база `dc-autosave`, стор `levels`, ключ — `fileName`),
  що зберігає `{rawText, positions, notePositions, renderStyle,
  savedAt}`; `scheduleAutosave`/`cancelScheduledAutosave` дебounсять
  запис на ~1с (`AUTOSAVE_DEBOUNCE_MS`) на мутацію рівня.
  Тестове середовище отримало `fake-indexeddb` (dev-залежність,
  підключена в `setupTests.ts`) — jsdom не має власної IndexedDB.
- `useDiagramStack`: `useEffect` на `current` планує автосейв на кожну
  мутацію рівня; кожен шлях завантаження (`openFiles`,
  `openTextAsDiagram`, `onOpenNative` — не share-link) після побудови
  рівня перевіряє IndexedDB на чернетку з тим самим `fileName` і, якщо
  є, виставляє `restorePrompt`. Новий банер у `App.tsx`
  (`restore-autosave-banner`) з кнопками Restore/Discard:
  Restore перебудовує рівень із чернетки (`buildLevel` на
  `record.rawText` + позиції/стилі з чернетки, усі позиції — manual);
  Discard просто чистить IndexedDB-запис. `onSave` скасовує заплановий
  запис і чистить чернетку для поточного файлу одразу після реального
  збереження.
- Тести: `localAutosave.test.ts` (round-trip, дебаунс на реальних
  таймерах — fake timers конфліктували з внутрішнім плануванням
  fake-indexeddb, тому дебаунс перевіряється короткими реальними
  паузами), новий e2e `autosave.spec.ts` (3 сценарії: reload
  пропонує Restore і повертає незбережену ноду; Discard очищає
  чернетку остаточно; Save очищає чернетку так, що банер більше не
  зʼявляється).
- Регресія: `npm test` (67/67), `npm run build`, повний
  `npx playwright test` (59 passed + 3 skipped — прихований
  draw.io-імпорт).
- Commit: `phase11-step3: сховати draw.io import за флагом, локальний автосейв IndexedDB`.

## phase11-step4 — Resize вузлів — 2026-07-04

- Формат: `internal/layout.Size{W,H}` (Go) + `View.Sizes` (JSON `sizes`,
  `omitempty`), round-трипиться в `Save` як `NotePositions`. Web-дзеркало
  — `LayoutSize{w,h}` у `layoutFile.ts` + `toLayoutSizes`/`fromLayoutSizes`
  конвертери до/від `DiagramLevel.sizes: Record<id,{width,height}>`
  (та сама модель, що й `positions`/`manualPositionIds`).
- `layout.ts`: `computeLayout(diagram, sizes?)` резервує фактичні
  розміри в ELK-графі замість базових `NODE_WIDTH/HEIGHT`; новий
  `applyNodeSizes(layout, sizes, positions?)` — єдина точка, де і канва,
  і SVG-експорт підміняють розмір вузла на ручний оверрайд, заразом
  розширюючи `width`/`height` полотна, якщо збільшений вузол виходить за
  межі auto-layout. `MIN_NODE_WIDTH/HEIGHT` = половина базового (як у
  плані).
- Канва: RF-вузли (`FlowCanvas.tsx`) отримують розмір як **top-level**
  `Node.width/height` (не в `data`) — саме туди пише `NodeResizer` під
  час драгу, тож ресайз плавний (без комітів у документ до
  `onResizeEnd`, той самий патерн одного коміту на жест, що й крок
  11.1). `NodeShell` (`rfNodeTypes.tsx`) малює `renderSvgInner`/handle-и
  на фактичний розмір; `<NodeResizer isVisible={selected}>` показується
  лише для виділеного вузла.
- `onNodeResizeStop` (нове в `useDiagramEditing.ts`) комітить
  `current.sizes` один раз на кінець ресайзу — той самий шлях, що
  `onNodeDrag`. `onRelayout`/`onRelayoutAll`/`applyOps`/
  `applyTextReplace` передають `sizes` у `computeLayout`, тож
  Re-layout не стискає збільшені вузли. Export (SVG/PNG/zip),
  Export layout, Share, локальний автосейв і Save — усі проведені
  через `sizes`/`applyNodeSizes`.
- Тести: `layout.test.ts` (резервація розміру в ELK, `applyNodeSizes`
  підміна+розширення бордерів, no-op на порожніх sizes); новий
  `e2e/resize.spec.ts` (3 сценарії: ресайз хендлом росте і переживає
  Save→Open+export-layout; SVG-експорт малює вузол у новому розмірі;
  імпорт layout відновлює розмір, Re-layout далі його не чіпає).
- Регресія: `go build/vet/test ./...` зелені, `./dc validate
  examples/*.dc.yaml` — 3/3 OK (WASM не зачеплений — `cmd/wasm` не
  імпортує `internal/layout`, тож `make wasm-test` для цього кроку не
  був потрібен); `npm test` (70/70), `npm run build`, повний
  `npx playwright test` (62 passed + 3 skipped — прихований draw.io).
- Commit: `phase11-step4: resize вузлів (layout-файл, канва, SVG-експорт)`.

## phase11-step5 — Формат: parent + довільні типи (Go core+schema+WASM) — 2026-07-04

- `internal/model.Node` отримав `Parent string` (yaml `parent`); `CustomType`
  розширено `Stroke`/`StrokeWidth`(+`HasStrokeWidth`)/`LineStyle`/
  `Rounded`(+`HasRounded`) — `Has*` прапорці відрізняють "не задано" від
  нульового значення. `schema/diagramcore.schema.json`: `node.type` більше
  не enum (будь-який непорожній рядок), додано `node.parent`,
  `custom_types` object-form отримав `stroke`/`strokeWidth`/`lineStyle`/
  `rounded`.
- `internal/validate`: `checkUnknownTypes` більше не звіряє тип вузла
  проти білого списку (лише тип лінку лишається `DC003`); нова
  `checkParents` — `DC011` (неіснуючий parent) і `DC012` (цикл у
  ланцюжку `parent`, включно з самопосиланням). Видалено мертвий
  `baseNodeTypes` (ніде більше не читався).
- Рендерери: `internal/transpile/d2.go` — `d2Paths` резолвить dot-path
  кожного вузла з ланцюжка `parent` (стійкий до циклів — зупиняє обхід
  на повторному id), вузли й посилання лінків пишуться повним шляхом
  (`gcp.k8s.pods`) — D2 малює це нативними вкладеними контейнерами.
  `internal/transpile/mermaid.go` — вкладені `subgraph`/`end` замість
  плоского списку. `internal/context/context.go` — `writeComponents`
  індентує дітей під батьком у Markdown-списку компонентів.
- Новий приклад `examples/nested.dc.yaml` (GCP → k8s → namespace →
  services, 3 рівні вкладеності + реальні зв'язки між листовими
  вузлами) — одразу задовольняє й фікстуру, яку крок 11.6 просить
  створити для канви.
- Тести: `internal/model` (parent round-trip, style-розширення
  custom_types), `internal/validate` (DC011/DC012 фікстури + valid
  3-рівневий ланцюжок + довільний тип більше не DC003), golden-тести
  D2/Mermaid/`dc context` на `nested` (плюс наявні golden для 3 базових
  прикладів — не зачеплені, бо в них немає `parent`), web
  `yamlPatch.test.ts` (updateNode встановлює/чистить `parent`).
- Регресія: `go build/vet/test ./...` зелені, `./dc validate
  examples/*.dc.yaml` (4/4, включно з новим nested), `make wasm &&
  make wasm-test` зелені (web-валідатор автоматично успадковує
  DC011/DC012 — той самий скомпільований `internal/validate`); `npm
  test` (70/70), `npm run build`, повний `npx playwright test` (62
  passed + 3 skipped — прихований draw.io).
- Commit: `phase11-step5: формат — parent-вкладеність, довільні типи вузлів (Go+schema+WASM)`.

## phase11-step6 — Контейнери на канві — 2026-07-04

- `layout.ts`: `computeLayout` тепер будує ІЄРАРХІЧНИЙ ELK-граф — вузли
  з дітьми стають `ElkNode.children` (з `elk.padding` — місце під
  заголовок контейнера), `elk.hierarchyHandling: INCLUDE_CHILDREN` для
  коректної маршрутизації ребер через межі рівнів; кожне ребро
  приписується наймолодшому спільному предку (`lowestCommonAncestor`
  через ланцюжки `ancestorChain`, з сентінел-значенням `""` для
  кореня). Результат сплющується (`collectNodes`/`collectEdges`) назад
  у плоский `LayoutNode[]`/`LayoutEdge[]` з **абсолютними** координатами
  для всіх вузлів незалежно від глибини вкладеності — свідомий вибір,
  щоб не переписувати жодного зі споживачів (`svgExport`, `positions`,
  `manualPositionIds`, resize-логіка з кроку 11.4): вони й далі
  працюють з абсолютними координатами як раніше. Лише `FlowCanvas`
  конвертує в parent-відносні координати React Flow безпосередньо в
  точці побудови RF-вузлів.
- Новий `resolveParents(diagram)` — резолвить лише ВАЛІДНІ (існуючі,
  не самопосилання, не циклічні) `parent`-посилання, дзеркалячи
  `internal/validate.checkParents`, але "лагодячи" замість відхилення:
  невалідний `parent` під час редагування — вузол просто top-level,
  не падіння.
- Канва: вузол з дітьми рендериться новим `ContainerNode`
  (`rfNodeTypes.tsx`) — пунктирна напівпрозора рамка з заголовком
  зверху-зліва через `renderContainerSvgInner` (новий у `shapes.ts`,
  спільний для канви й SVG-експорту — контейнер не може виглядати
  по-різному в двох місцях). RF-вузли з `parent:` отримують `parentId`
  (без `extent: 'parent'` — навмисно, інакше React Flow фізично не дав
  би витягнути дитину за межі контейнера, а це потрібно для зняття
  parent). Дитина рахується вільно (RF сам конвертує дельту руху у
  відносні координати); контейнер — те саме, і всі його діти їдуть
  разом (RF-нативна поведінка вкладених вузлів).
- Драг-коміт (`FlowCanvas.handleNodeDragStop`): конвертує RF-позицію
  назад в абсолютну (додаючи абсолютну позицію старого контейнера,
  якщо він був), перевіряє перетин центру вузла з бордерами всіх
  контейнерів (найменша площа серед перетинів — щоб влучення у
  вкладений контейнер не "спливало" до зовнішнього), виключає себе й
  нащадків (`isSelfOrDescendant`, запобігає циклу при перетягуванні
  контейнера в себе). Якщо контейнер змінився — новий необов'язковий
  третій аргумент `onNodeDragStop(id, pos, newParent)` (`undefined` —
  без змін, `null` — став top-level). `useDiagramEditing.onNodeDrag`
  при зміні контейнера патчить `parent:` через `applyOps` (з опцією
  `manualPosition`, той самий шлях що й `onDropNodeType`) замість
  простого `updateCurrentLevel`.
- Resize контейнера: `NodeResizer`, `minWidth`/`minHeight` рахуються
  динамічно з bbox дітей (в `FlowCanvas`, той самий `geometry`, що й
  для драгу) — не менші за нього, як вимагає план.
- SVG-експорт (`svgExport.ts`): контейнери малюються тим самим
  `renderContainerSvgInner` (id, що згадуються як чийсь `parent`,
  розпізнаються автоматично); оскільки `layout.nodes` вже в порядку
  "предок перед нащадком" (гарантія `collectNodes`), контейнери
  завжди малюються під дітьми без додаткового сортування.
- Тести: `layout.test.ts` (7 нових — вкладеність без перекриттів,
  маршрутизація ребра через межу контейнера, `resolveParents` на
  dangling/cycle/valid-chain), `svgExport.test.ts` (контейнер малюється
  до дитини), новий e2e `containers.spec.ts` (7 сценаріїв на
  `examples/nested.dc.yaml`: контейнери рендеряться окремо; драг
  дитини всередині не міняє parent; драг у контейнер/з контейнера
  міняє/знімає parent (з поллінгом — реparent іде через асинхронний
  `applyOps`, на відміну від чистого драгу позиції); драг контейнера
  тягне дітей разом; Re-layout без перекриттів; SVG-експорт == канва;
  YAML-панель показує `parent:`).
- Регресія: `go build/vet/test ./...`, `./dc validate
  examples/*.dc.yaml` (4/4), `npm test` (79/79), `npm run build`,
  повний `npx playwright test` (69 passed + 3 skipped — прихований
  draw.io).
- Commit: `phase11-step6: контейнери на канві (ієрархічний ELK, ContainerNode, drag reparent)`.

## phase11-step7 — Вкладки діаграм + breadcrumbs, автозавантаження details — 2026-07-04

- `useDiagramStack.ts` рефакторено зі «стека рівнів» (`stack: DiagramLevel[]`,
  `goToLevel(index)`) у мапу відкритих вкладок: `levels: Record<fileName,
  DiagramLevel>`, `openTabs: string[]` (порядок відкриття, головний файл —
  завжди перший), `activeTab`, `mainFileName`, `tabErrors` (файл, що не
  розпарсився, лишається вкладкою з помилкою замість падіння всього),
  `tabParent` (fileName → fileName вузла, що відкрив його `details:`, для
  breadcrumb). `switchTab`/`closeTab` замінили `goToLevel`.
- При будь-якому відкритті документа (`openFiles`/`openTextAsDiagram`/
  `onOpenNative`/share-link/autosave-restore) — новий `openTree`/
  `loadReachableDetails` обходить `details:`-посилання в ширину і одразу
  парсить/лейаутить УСІ досяжні файли з virtualFS (кожен відвідується раз;
  недоступний у virtualFS — пропускається мовчки, як і раніше при
  подвійному кліку; помилка парсингу одного файлу лишає його вкладкою з
  повідомленням, не валить головний). Перемикання (`switchTab`) — просто
  зміна `activeTab`, без повторного парсингу.
- Undo/redo — окремий стек на вкладку (`historyByTab: Map<fileName,
  {past,future}>`); `historyRef.current` (сирий `MutableRefObject`, який
  читає/пише `useHistory.ts`) перепризначається на запис активної
  вкладки при кожному `switchTab` — сам `useHistory.ts` лишився
  незмінним. Черга мутацій (`runMutation`) також розбита по вкладках,
  але ключ береться в момент ПОСТАНОВКИ мутації в чергу (не лінивим
  читанням activeTab під час виконання) — перемикання вкладки під час
  виконання асинхронної мутації більше не ризикує застосувати правку не
  до тієї вкладки.
- Подвійний клік по вузлу з `details:` (`openDetails`) тепер синхронний
  (дані вже завантажені): якщо вкладка існує (чи мала помилку) —
  перемикає на неї, повторно додаючи в `openTabs`, якщо користувач її
  раніше закрив; якщо файлу нема у virtualFS взагалі — той самий
  `drillError`, що й раніше.
- Нова стрічка вкладок `TabStrip.tsx` над канвою (назва/заголовок
  діаграми, `•` при незбережених змінах, ⚠ при помилці парсингу, кнопка
  закриття лише для не-головних вкладок). Breadcrumb (`AppHeader.tsx`)
  тепер рендериться з `breadcrumbFileNames` (шлях від головного файлу до
  активної вкладки через `tabParent`), клік — `switchTab` замість
  `goToLevel`; той самий testid-контракт (`breadcrumb-{i}`), тому наявний
  e2e (`drill-down.spec.ts`) пройшов без правок.
- Автосейв лишився прив'язаним до `current` (активної вкладки) — оскільки
  редагування завжди йде через активну вкладку, кожна вкладка отримує
  власний автосейв-запис за своїм `fileName` без додаткових змін у
  `localAutosave.ts`.
- Тести: наявний `drill-down.spec.ts` (4/4) пройшов незмінним; новий
  `e2e/tabs.spec.ts` (5 сценаріїв: усі досяжні вкладки з'являються одразу;
  перемикання без реparsing і незалежні правки; двоклік перемикає
  вкладку; закриття+повторне відкриття через двоклік; undo незалежний
  на вкладку).
- Регресія: `go build/vet/test ./...`, `./dc validate examples/*.dc.yaml`
  (4/4), `npm test` (79/79), `npm run build`, повний `npx playwright
  test` (74 passed + 3 skipped — прихований draw.io).
- Commit: `phase11-step7: вкладки діаграм + breadcrumbs, автозавантаження details`.

## phase11-step8 — Стилі вузлів: інстанс-оверрайди + Properties UI — 2026-07-04

- `internal/layout.Style{Fill,Stroke,StrokeWidth,LineStyle,Rounded}` +
  `View.Styles`, round-трипиться в `Save` як `Sizes`/`NotePositions`.
  Заразом підтягнуто пропущені з кроку 11.4 `sizes`/`size` у
  `schema/layout.schema.json` (мали бути додані тоді, але не були) —
  тепер разом зі `styles`.
- Web-дзеркало: `layoutFile.ts` — `LayoutStyle` + `styles?` на `View`,
  `buildLayoutFile` отримав 5-й параметр. `DiagramLevel.styles:
  Record<id, LayoutStyle>` — той самий патерн, що й `sizes` (маніфестне
  дублювання по всіх точках: `buildLevel`, `onOpenNative`, share-link
  ефект, autosave-restore, `onSave`/`onExportLayout`/`onShare`,
  `localAutosave.ts`'s `AutosaveData`). **Знайдено й виправлено
  побічний баг**: `onImportLayout` у `useDiagramEditing.ts` зливав
  `sizes`, але додавання `styles` пропустили в тому самому місці —
  полагоджено (деталі — `docs/deviations.md`, крок 11.8).
- `shapes.ts`: `ShapeStyle` розширено `lineStyle`/`rounded`; усі функції
  фігур (`rectShape` та rect/ellipse/storage/diamond/parallelogram/
  hexagon/cloud) тепер консультують `resolveDashArray` (інстанс
  `lineStyle` перекриває вбудований dasharray фігури, напр. `external`
  за замовчуванням пунктирний) — і `rounded` для rect-подібних. Новий
  `resolveNodeStyle(diagram, type, instanceOverride)` — єдина точка
  резолву пріоритету інстанс → `custom_types` (тип-рівень, розширений
  ще в кроці 11.5) → тема (лишається на відкупі викликача, як і
  раніше). `nodeVisual` тепер повертає ще й
  stroke/strokeWidth/lineStyle/rounded з `custom_types`.
- Канва (`FlowCanvas.tsx`+`rfNodeTypes.tsx`): для КОЖНОГО вузла (не
  лише custom, як стилі типу раніше) рахується `resolveNodeStyle(...,
  current.styles[id])`, результат — у `data.color`/`strokeColor`/
  `strokeWidthOverride`/`lineStyle`/`rounded`; `NodeShell` використовує
  їх для fill/stroke/strokeWidth/lineStyle/rounded параметрів
  `renderSvgInner`, active/visited/selected-підсвітка як і раніше має
  пріоритет над `strokeColor`-оверрайдом (як з flow-highlight
  кольорами). SVG-експорт (`svgExport.ts`) отримав `styles` параметр
  і йде через ту саму `resolveNodeStyle` — тому canvas і export не
  можуть розійтись.
- `PropertiesPanel.tsx`: нова секція Style — color-picker fill/stroke,
  select товщини (1-4), select типу лінії (solid/dashed/dotted),
  checkbox заокруглення, кнопка "Reset style" (вимкнена, якщо
  оверрайду нема). `useDiagramEditing.ts`: `onUpdateNodeStyle`/
  `onResetNodeStyle` патчать `current.styles` напряму через
  `updateCurrentLevel` (не `applyOps`/YAML) — стилізація не чіпає
  `rawText`.
- Тести: `shapes.test.ts` (lineStyle перекриває вбудований dasharray,
  rounded перемикає rx, sketch-режим поважає fill/stroke/strokeWidth
  оверрайду, `resolveNodeStyle` пріоритет інстанс→тип→base-без-типу),
  `svgExport.test.ts` (оверрайд застосовується лише до потрібного
  вузла), новий e2e `node-style.spec.ts` (4 сценарії: зміна видима
  одразу і YAML незмінний; Reset style; виживає Export→Import layout;
  sketch-пресет малює оверрайд-кольори).
- Регресія: `go build/vet/test ./...`, `./dc validate
  examples/*.dc.yaml` (4/4), `npm test` (86/86 — включно з дрібним
  hardening флейкі-тесту `App.test.tsx`, що виявився під паралельним
  навантаженням тестів: rf-node-* перевірка тепер під `waitFor`, бо
  React Flow монтує контейнер і вузли в різні паси), `npm run build`,
  повний `npx playwright test` (78 passed + 3 skipped — прихований
  draw.io).
- Commit: `phase11-step8: інстанс-стилі вузлів + Properties UI Style-секція`.

## Крок 11.9 — Ребра: стрілки/стиль/рухомі лейбли/видимість
- `web/src/edgeStyle.ts` (новий): `edgeLinkKey(link)` — стабільний
  ключ ребра (`from->to:type`, формат не має id для links) для всіх
  per-instance edge-мап; `EdgeMarker = 'none'|'arrow'|'open-arrow'`,
  `EdgeStyleOverride{markerStart?,markerEnd?,lineStyle?,strokeWidth?,
  color?}`, `resolveEdgeStyle(override)` — дефолт markerStart='none',
  markerEnd='arrow' (те саме, що й раніше без оверрайду).
- Go `internal/layout.go`: `EdgeStyle{MarkerStart,MarkerEnd,LineStyle,
  StrokeWidth,Color}`, `View.EdgeStyles map[key]EdgeStyle`,
  `View.EdgeLabelOffsets map[key]Position`, `View.HiddenEdgeLabels
  []string` — round-trip у `Save()` поряд із `Sizes`/`Styles`.
  `schema/layout.schema.json` розширено відповідно.
- `layoutFile.ts`: дзеркальні типи + `LayoutFile.views[].edgeStyles/
  edgeLabelOffsets/hiddenEdgeLabels`. `buildLayoutFile` рефакторено з
  8 позиційних параметрів на один options-об'єкт
  (`BuildLayoutFileInput`) — далі додавати поля безпечно. Новий
  `buildLayoutFileFromLevel(level)` — єдина точка "level → layout
  file", використовується в `onSave`/`onExportLayout`/`onShare`
  замість дублювання маппінгу по трьох місцях.
  `DiagramLevel` (`useDiagramStack.ts`) отримав `edgeStyles`,
  `edgeLabelOffsets: Record<key, LayoutPosition>`,
  `hiddenEdgeLabels: Set<key>` — проведено по всіх тих самих точках,
  що й `sizes`/`styles` у кроці 11.8 (`buildLevel`, `onOpenNative`,
  share-link ефект, autosave restore/schedule, `onSave`'s
  `hasLayoutToSave`, `onImportLayout`, `localAutosave.ts`'s
  `AutosaveData`).
- Канва: `FlowCanvas.tsx` рахує `resolveEdgeStyle(edgeStyles?.[key])`
  на кожне ребро, мапить `EdgeMarker` → React Flow `MarkerType` через
  `toRfMarker` (`'arrow'`→`ArrowClosed` залитий, `'open-arrow'`→
  `Arrow` незалитий — навмисно НЕ 1:1 з рядковими значеннями RF-енуму,
  див. `docs/deviations.md` крок 11.9) і виставляє їх як
  `markerStart`/`markerEnd` на RF edge-об'єкті (звідки їх бере
  вбудований механізм генерації `<marker>` defs). `rfEdgeTypes.tsx`
  (`DcEdge`): резолвлений color/strokeWidth/lineStyle застосовується,
  коли ребро не active/visited/hovered (той самий пріоритет, що й для
  вузлів); лейбл — реалізовано drag через pointerdown/move/up з
  діленням дельти на `getZoom()` (портал `EdgeLabelRenderer` живе в
  тому самому трансформованому просторі, що й канва), коміт офсету
  лише на pointerup; подвійний клік на лейблі → `window.prompt` →
  патч `link.label` через `applyOps`; видимість — `data.showLabel`
  (глобальний View-тумблер AND не в `hiddenEdgeLabels`).
- `svgExport.ts`: `RenderOptions` отримав `edgeStyles`/
  `edgeLabelOffsets`/`hiddenEdgeLabels`/`showEdgeLabels`. Раніше
  ребра завжди малювались з ОДНИМ статичним `<marker id="arrow">`
  (насправді залитий трикутник) і БЕЗ лейблів взагалі (пропуск,
  виявлений під час цього кроку) — тепер на кожне ребро генеруються
  власні marker-defs через резолвлений стиль, і лейбл малюється як
  `<text>` у midpoint ребра + офсет. Дефолтний (без оверрайду) вигляд
  залишено як був (canvas/export і до цього кроку малювали дефолтну
  стрілку по-різному — не виправлялось, деталі в deviations.md).
- `LinksPanel.tsx`: розгорнутий рядок лінку контролюється зверху
  (`selectedIndex`/`onSelectIndex` замість локального `useState`) —
  так клік по ребру на канві й клік у списку відкривають той самий
  рядок. Додано select для start/end marker, line style, stroke
  width, color-picker, checkbox "Hide this label", кнопка "Reset
  style". Клік по ребру поза flow-recording (`onEdgeClickRecord` у
  `useDiagramEditing.ts`) тепер виставляє `selectedLinkIndex` замість
  нічого не робити — `EditorWorkspace` перемикає правий док на
  Links-таб тим самим ефектом, що й для `selectedNodeId`/Properties.
- View-меню: новий тумблер "Connection labels" (show/hide all) —
  `useViewSettings.ts`'s `showEdgeLabels` (localStorage-персистентний
  UI-preference, як grid/snap; на відміну від per-edge hide, який
  живе в layout-файлі/share-link). `dc context`/AI-експорт (Go
  `internal/context`) взагалі не імпортує `internal/layout` — тому
  структурно не бачить hidden-label стан; підтверджено раундтрип-
  тестом у `layout_test.go`.
- Тести: `edgeStyle.test.ts` (стабільність ключа, дефолт-резолюція),
  `svgExport.test.ts` +2 (marker/line-style/color оверрайд; лейбл на
  офсеті + глобальна/індивідуальна видимість), `internal/layout`
  `TestSavePreservesWebEditorOnlyFields` розширено на нові поля.
  Новий e2e `edge-style.spec.ts` (7 сценаріїв: клік по ребру відкриває
  Links-док; зміна маркера/стилю/товщини/кольору видима на канві і
  YAML незмінний; виживає Export→Import layout однаково на канві;
  Reset style; drag лейблу незалежно від ребра, офсет виживає
  Export→Import; подвійний клік редагує текст лейблу; View → Connection
  labels ховає всі, individual checkbox ховає один).
- Знайдено під час написання e2e: реальний `.dblclick()` на лейблі
  ламається через `setPointerCapture` у моєму ж pointerdown-обробнику
  drag'у (той самий клас багів, що й node dblclick у кроці 7.2) —
  тест перейшов на `dispatchEvent('dblclick')`, як уже робили
  `flow-editor.spec.ts` для кліків по ребрах.
- Регресія: `go build/vet/test ./...`, `./dc validate
  examples/*.dc.yaml` (4/4), `npm test` (91/91), `npm run build`,
  повний `npx playwright test` (85 passed + 3 skipped — прихований
  draw.io).
- Commit: `phase11-step9: ребра — стрілки/стиль/рухомі лейбли/видимість`.

## Крок 11.10 — Мультивиділення і базові операції редагування
- `FlowCanvas.tsx`: rubber-band (shift+drag, React Flow builtin) тепер
  щось означає — `selected`/`data.isSelected` явно виставлені на кожному
  rf-вузлі/ребрі (замість `undefined`) і синхронізуються окремим ефектом
  через функціональний `setNodes(prev => prev.map(...))`, а не через
  основний `allNodes`-меморизований масив (детально, разом із двома
  супутніми React Flow пастками навколо `onSelectionChange` — див.
  `docs/deviations.md`, крок 11.10). Нові пропси `selectedNodeIds`,
  `onSelectionChange`, `onGroupDragStop`; `onSelectionDragStop` комітить
  усі позиції виділеної групи ОДНИМ викликом.
  `deleteKeyCode={null}` — вимкнено вбудоване RF-видалення по Backspace,
  бо своє власне (з каскадним прибиранням лінків/flow-steps і
  підтвердженням) іде через `applyOps`.
- `useDiagramEditing.ts`: `selectedNodeIds: string[]` — окремий від
  `selectedNodeId` стан (навмисно; `selectedNodeId` лишається лише на
  власному 250мс deferred-click шляху, не на RF-похідному — інакше
  подвійний клік по вузлу з `details:` встигає на мить перемкнути
  правий док на Properties ще до drill-down). `onDeleteSelectedNode`
  узагальнено на список id (з дедуплікацією залежних лінків/flow-steps
  між кількома вибраними вузлами) — один `applyOps`, один крок undo.
  Новий `onDuplicateSelectedNodes` (Cmd/Ctrl+D): клонує кожен вибраний
  вузол (новий унікальний id `<id>-copy[N]`, ті самі поля, позиція зі
  зсувом +40/+40) в одному виклику. `applyOps`'s `manualPosition`
  (одиничний) замінено на `manualPositions` (масив) — обидва старі
  виклики (`onDropNodeType`, `onNodeDrag` reparent) оновлено.
  Клавіатурні шорткати (Delete/Backspace, Cmd/Ctrl+D, Esc) — єдиний
  `window`-ефект, що ігнорує events із текстових полів/select/
  contenteditable.
- View-незалежні дрібниці: Edit-меню отримав "Duplicate" поруч із
  "Delete" (лейбл рахує кількість вибраних вузлів), обидва враховують
  `selectedNodeIds` як і клавіатурні шорткати.
- Регресія: `go build/vet/test ./...`, `./dc validate
  examples/*.dc.yaml` (4/4), `npm test` (91/91), `npm run build`,
  повний `npx playwright test` (90 passed + 3 skipped — прихований
  draw.io), новий `e2e/multi-select.spec.ts` (5 сценаріїв: rubber-band +
  групове перетягування одним апдейтом; Delete кількох з підтвердженням
  + Undo одним кроком; Duplicate; Esc знімає виділення; Edit-меню працює
  з поточним виділенням).
- Commit: `phase11-step10: мультивиділення — rubber-band, групове
  перетягування, Delete/Duplicate, Esc`.

## Крок 11.11 — Полірування + фінальна регресія фази (фаза 11 завершена)
- 250мс click/dblclick затримка (`FlowCanvas.tsx`'s `clickTimer`) —
  НЕ прибрана; крок 11.10 підтвердив, що вона й досі потрібна (деталі —
  `docs/deviations.md`, крок 11.11).
- Перф-чек (`e2e/perf.spec.ts`, новий): згенерована діаграма 100
  вузлів/150 ребер (одноразовий тимчасовий файл, не фікстура в репо) —
  відкриття, драг вузла, панорамування канви, zoom-колесом. Виміряно
  (M-серії Mac, Chromium, локально): відкриття ~550-620мс, драг
  ~180-280мс, панорамування ~125-130мс, zoom ~55-65мс — жодних
  фризів/таймаутів; асерції з великим запасом (<5с на жест) лишають
  тест як регрес-сітку, а не строгий перф-бюджет.
- `docs/format.md`: секція Layout-файлу доповнена `sizes`/`styles`/
  `edgeStyles`/`edgeLabelOffsets`/`hiddenEdgeLabels` (кроки 11.4/11.8/
  11.9 раніше додали ці поля до Go/web-типів, але не до документа-
  специфікації) — `parent`/`custom_types`-розширення вже були
  задокументовані в кроці 11.5.
- `Tour.tsx`: додано 3 нові тіпи (вкладеність через `parent`/контейнери,
  стилі вузла/ребра через Properties/Links панелі, rubber-band
  мультивиділення + Delete/Duplicate) — `tour.spec.ts` не прив'язаний
  до конкретної кількості тіпів, пройшов без змін.
- Регресія (повна, фінальна для фази 11): `go build/vet/test ./...`,
  `./dc validate examples/*.dc.yaml` (4/4), `make wasm-test` (OK),
  `npm test` (91/91), `npm run build`, повний `npx playwright test`
  (91 passed + 3 skipped — прихований draw.io, включно з новим
  `perf.spec.ts`).
- Commit: `phase11-step11: полірування — перф-чек, docs/format.md,
  Tour — фаза 11 завершена`.

# Фаза 11 завершена (2026-07-04)

Функціональне ядро редактора: `parent`-вкладеність + контейнери на
канві, resize/instance-стилі вузлів і ребер (маркери/лінії/лейбли),
вкладки діаграм з автозавантаженням `details:`, локальний автосейв,
мультивиділення з груповими Delete/Duplicate/drag. Наступний план —
новий PLAN-файл, якщо власник вирішить продовжити.
