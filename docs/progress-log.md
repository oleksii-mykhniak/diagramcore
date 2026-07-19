# Progress log — фаза 12 (PLAN4.md)

Журнал фаз 0–10 — `docs/plans/progress-log-phases-0-10.md`;
фази 11 — `docs/plans/progress-log-phase-11.md`.

Формат запису: `## phase12-step<M> — <опис>` + дата, коміт, що зроблено,
відхилення (якщо були — детально в `docs/deviations.md`).

---

## Підготовка — 2026-07-18

- Створено PLAN4.md (фаза 12: продакшн-рівень редагування — фікс
  «стрибання» при додаванні вузла, уніфікація стрілок, інлайн-текст +
  текст-стилі, об'єднання Links у Properties, приховування конектів/
  текстів + Core view, z-порядок, картинки, групування, copy/paste,
  вирівнювання). Анімація (GIF+WebM) — ескіз PLAN5 усередині PLAN4.md.
- PLAN3.md і progress-log фази 11 перенесено в `docs/plans/`,
  CLAUDE.md оновлено.
- Рішення фази погоджено з власником (Links = злиття панелей, не зміна
  формату; картинки — окремі файли в assets/; анімація — обидва формати
  окремою фазою; приховування — тільки в layout-файлі).

## Підготовка (доповнення) — 2026-07-18

- PLAN4 доповнено за запитом власника: новий крок 12.3 — чесний
  dirty-стан і синхронізація з диском (знайдені причини: dirty ігнорує
  layout-зміни, `onRestoreAutosave` виставляє savedRawText = чернетка,
  документи без handle — вічний «Unsaved»; рішення: снапшот обох
  файлів, індикатор 3 станів, опційний Auto-save to file) та новий
  крок 12.13 — панель History як у Photoshop (іменовані снапшоти
  YAML+layout, undo для drag/стилів, вкладка History у доці).
  Наступні кроки перенумеровано (12.3→12.4 … 12.12→12.14).

## phase12-step1 — Баг: додавання елемента «стрибає» всією діаграмою — 2026-07-19

- Причина: `applyOps`/`applyTextReplace` (`web/src/hooks/useDiagramEditing.ts`)
  на кожну структурну правку брали позицію зі старого `level.positions`
  тільки для вузлів у `manualPositionIds`; усі решта (звичайні
  auto-layout вузли, доданих раніше без ручного перетягування) щоразу
  отримували свіжі координати з `computeLayout`, тобто вся діаграма
  перекладалась при будь-якій структурній правці (додавання/видалення
  вузла, будь-який `applyPatch`).
- Фікс: позиція наявного вузла (є в `level.positions`) завжди
  зберігається як була, незалежно від `manualPositionIds` —
  auto-layout координати з ELK застосовуються лише до вузлів, яких
  раніше не було. `manualPositionIds` і далі трекає «ручність» для
  Re-layout (не Re-layout all). Явні Re-layout/Re-layout all — без
  змін, перераховують як і раніше.
- Новий e2e `web/e2e/no-layout-jump.spec.ts`: drop з палітри не рухає
  жоден наявний вузол; видалення вузла не рухає решту, undo повертає
  і вузол, і позиції; Re-layout all і далі перекладає все.
- Регресія: `npm test` (91 passed), `npm run build`, `npx playwright
  test` на drag-layout/containers/multi-select/resize/undo-redo/
  node-crud/no-layout-jump (24+3 passed).
- Commit: phase12-step1: фікс «стрибання» діаграми при структурних правках

## phase12-step2 — Баг: стрілки конектів — уніфікація канва ↔ експорт — 2026-07-19

- Причина: тип дефолтного маркера вже збігався (закрита стрілка) з
  кроку 11.9, але справжнє розходження було в кольорі — канва
  передавала React Flow голий `MarkerType` без `color`, тож RF малював
  маркер фіксованим кольором, що не стежив за per-edge стилем
  (активний/visited/hover/кольоровий оверрайд); SVG-експорт натомість
  завжди коректно фарбував маркер у той самий `stroke`, що й лінію.
  Тобто на канві кольорове/підсвічене ребро мало кольорову лінію, але
  сірий наконечник — розбіжність саме там, де AC вимагав перевірку
  («маркери успадковують колір ребра»).
- Фікс: нова спільна `resolveEdgeColor` (`web/src/edgeStyle.ts`) —
  один пріоритет (active > visited > hover > оверрайд > дефолтна межа)
  — використовується і `DcEdge` для лінії, і `FlowCanvas.tsx`'s
  `toRfMarker`, який тепер повертає `{ type, color }` замість голого
  `MarkerType`. Розмір/позиція маркера відносно `strokeWidth` вже
  збігались і без змін (обидва рендери використовують SVG-дефолт
  `markerUnits="strokeWidth"`).
- Записано в `docs/deviations.md` (крок 11.9 — розходження закрито).
- Нові тести: `edgeStyle.test.ts` (`resolveEdgeColor` пріоритет),
  `svgExport.test.ts` (дефолтний маркер = закрита стрілка кольору межі;
  маркер успадковує колір активного flow), e2e
  `web/e2e/edge-marker-parity.spec.ts` (4 тести: дефолт, кольоровий
  оверрайд, `open-arrow`, `none` — канва й експорт порівнюються
  напряму через DOM `<marker>`/inline style і текст експортованого
  SVG).
- Регресія: `npm test` (94 passed), `npm run build`, `npx playwright
  test` на edge-style/edge-marker-parity/export-dialog/flow-player
  (16 passed).
- Commit: phase12-step2: уніфікація кольору стрілок конектів канва ↔ експорт

## phase12-step3 — Баг: чесний dirty-стан і синхронізація з файлом на диску — 2026-07-19

- Причина (3 окремі баги, всі підтверджені в коді до фікса):
  1. `hasUnsavedChanges` = `rawText !== savedRawText` — жодного порівняння
     layout-стану, тож drag/resize/стиль/приховування ніколи не
     позначали документ як незбережений.
  2. `onRestoreAutosave` виставляв `savedRawText` = текст ЧЕРНЕТКИ, тож
     одразу після Restore індикатор брехав, що все збережено, хоча файл
     на диску інший.
  3. Для документів без native handle Save (fallback-download) уже
     коректно знімав прапорець, але без відстеження автосейву єдиним
     станом був вічний «Unsaved changes» — жодного сигналу, що чернетка
     вже в безпеці в IndexedDB.
- Фікс:
  - `layoutFile.ts`: `layoutSnapshotOf` — детермінована серіалізація
    (сортування ключів на кожному рівні), щоб той самий layout,
    зібраний різними шляхами мутацій, завжди порівнювався рівним.
  - `DiagramLevel.savedLayoutSnapshot` — снапшот layout на момент
    останнього Save/відкриття, поряд із `savedRawText`.
    `levelHasUnsavedChanges` (експортовано, використовує і хук, і
    `TabStrip`) = порівняння ОБОХ. Мемоізовано на ідентичність `current`
    (`useMemo`), не рахується на кожен рендер.
  - `onRestoreAutosave`: новий `diskSnapshotForRestoreRef`, заповнюється
    в `checkAutosave` тим, що реально щойно завантажено з файлу —
    Restore лишає `savedRawText`/`savedLayoutSnapshot` вказувати на
    диск, а не на чернетку.
  - Індикатор трьох станів (`saveStatus: 'saved'|'draft'|'unsaved'`):
    `scheduleAutosave` (`localAutosave.ts`) отримав опційний `onSaved`
    колбек, що спрацьовує після реального запису в IndexedDB — хук
    трекає `autosavedByTab` і звіряє з поточним rawText/layout-снапшотом,
    щоб відрізнити «щойно відредаговано, дебаунс ще не доїхав»
    (Unsaved) від «дебаунс доїхав, чернетка безпечна» (Draft ·
    autosaved HH:MM). `beforeunload`-guard тепер зважає лише на
    `saveStatus === 'unsaved'`.
  - «Auto-save to file» — File-меню тумблер (`menu-auto-save-to-file-toggle`,
    localStorage), для документів із native handle: той самий дебаунс,
    пише YAML завжди; layout-файл — лише якщо `layoutHandle` вже існує
    (щоб не спливав native Save-picker у фоні як несподіванка).
- Нові тести: `layoutFile.test.ts` (`layoutSnapshotOf` — незалежність
  від порядку ключів, чутливість до реальних змін), e2e
  `dirty-state.spec.ts` (3 тести: Unsaved→Draft після дебаунсу; Save
  знімає прапорець навіть без текстової правки; Restore лишає документ
  чесно незбереженим), e2e `auto-save-to-file.spec.ts` (тумблер сам
  доводить правку до диска, індикатор — Saved без Ctrl+S).
- Виявлено (поза скоупом цього кроку): `drill-down.spec.ts` тест
  «...clicking back restores dragged positions and the selected flow»
  падає на `flow-step-count` після повернення по breadcrumb — детерміновано
  відтворюється і на HEAD ДО цього кроку (перевірено git stash), отже
  існуючий баг, не регресія. Занесено сюди для видимості; окремий
  крок/фікс не заводимо, бо не в тематиці 12.3.
- Регресія: `npm test` (97 passed), `npm run build`, `npx playwright
  test` — 101/105 passed, 3 skipped (drawio, feature-flagged), 1
  pre-existing failure (drill-down, див. вище, не пов'язаний з цим
  кроком).
- Commit: phase12-step3: чесний dirty-стан і синхронізація з диском

## phase12-step4 — Інлайн-редагування тексту на канві — 2026-07-19

- Лейбл вузла: dblclick на вузлі БЕЗ `details:` відкриває інлайн
  `<input>` поверх лейбла (замінює `<span>` в `NodeShell`, той самий
  DOM-вузол/testid); Enter комітить через `applyOps` (`updateNode`
  `label`), Esc/blur без змін скасовує. Вузол З `details:` і далі
  відкриває drill-down по dblclick (без змін); F2 на виділеному вузлі
  відкриває той самий редактор для БУДЬ-ЯКОГО вузла (з деталями чи без).
  Контейнери — окремий рендер-компонент без інлайн-редагування, dblclick
  на них лишається no-op (як і було).
- Лейбл ребра: dblclick відкриває інлайн `<input>` НА МІСЦІ лейбла
  (замінює `onLabelDoubleClick`, що робив `window.prompt`); Enter/blur
  комітить через `onUpdateLink`, Esc скасовує, порожній текст видаляє
  `label` з лінка.
- Реалізація: `FlowCanvas.tsx` тримає `editingNodeId`, патчить
  `isEditing`/`onEditCommit`/`onEditCancel` напряму в живий `nodes`-стан
  (той самий патерн, що вже був для `isSelected` — щоб не зачіпати
  `allNodes`/позиції під час драгу); F2 іде окремим шляхом
  (`editNodeRequest` у `useDiagramEditing.ts`, `{id, nonce}` — nonce,
  щоб повторний F2 на тому самому вузлі знову відкривав редактор).
  Едж-лейбл — стан локальний у `DcEdge` (`rfEdgeTypes.tsx`), без
  проброшування через пропси нагору.
- **Знайдена пастка (не в АС, але важлива):** `data-selected`
  (drivено `selectedNodeIds`, через RF-івський майже миттєвий
  `onSelectionChange`) стає `true` РАНІШЕ за `selectedNodeId`
  (однина, джерело для F2/Properties) — той комітиться лише після
  250мс debounce-таймера кліку (розрізнення click/dblclick, крок 7.2).
  E2E, що чекає на F2 одразу після `data-selected`, ловить
  `selectedNodeId === null`. Тест написано так, щоб чекати
  `properties-panel` (яка й похідна від `selectedNodeId`), а не
  `data-selected`.
- Оновлено `edge-style.spec.ts`'s dblclick-тест (був на
  `window.prompt`/`dialog.accept`) — тепер заповнює/комітить інлайн
  `<input>`, плюс новий тест на Escape-скасування.
- Нові тести: e2e `inline-label-edit.spec.ts` (4: dblclick-редагування
  вузла + Enter, Escape-скасування, undo одним кроком, F2 для вузла з
  details і без).
- Регресія: `npm test` (97 passed), `npm run build`, `npx playwright
  test` — 106/110 passed, 3 skipped (drawio), 1 pre-existing failure
  (drill-down, задокументовано в кроці 12.3, не зачеплено цим кроком).
- Commit: phase12-step4: інлайн-редагування тексту вузлів і лейблів ребер

## phase12-step5 — Налаштування тексту (розмір, жирність, колір, вирівнювання) — 2026-07-19

- Go `internal/layout`: новий `TextStyle` (`fontSize`, `bold`, `italic`,
  `color`, `align`), поле `Text *TextStyle` у `Style` і `EdgeStyle`;
  `Save` уже round-трипить `Styles`/`EdgeStyles` цілими мапами (без
  пофайлового розбору полів), тож новий `Text` зберігається без
  додаткових змін у `Save`. Схема (`schema/layout.schema.json`) отримала
  `$defs/textStyle`, підключений з `style`/`edgeStyle`.
  `TestSavePreservesWebEditorOnlyFields` розширено: тепер сідить і
  звіряє і `Styles["User"].Text`, і `EdgeStyles[...].Text`.
- Веб-дзеркало: `shapes.ts` (`TextStyleOverride`, `StyleOverride.text`,
  `ResolvedNodeStyle.text`, `resolveNodeStyle` резолвить — інстанс →
  дефолт теми, без проміжного custom_types-рівня, якого текст-стилі й
  не мають), `edgeStyle.ts` (`EdgeStyleOverride.text`/
  `ResolvedEdgeStyle.text`, `align` присутній типово, але завжди
  ігнорується для ребра), `layoutFile.ts` (`LayoutTextStyle`, вкладено
  в `LayoutStyle`/`LayoutEdgeStyle`). Жодних додаткових змін merge-точок
  (buildLevel/autosave/share-link/onSave/onImportLayout) не знадобилось
  — `Style`/`EdgeStyle` там завжди трактуються як непрозорі об'єкти,
  тож вкладений `text` подорожує автоматично.
- Єдина точка резолву — `resolveNodeStyle`/`resolveEdgeStyle`, як і для
  решти інстанс-стилів; канва (`NodeShell` в rfNodeTypes.tsx, `DcEdge`
  в rfEdgeTypes.tsx) і SVG-експорт застосовують те саме
  `resolved.text` — жодних розбіжностей рендеру.
- `onUpdateNodeStyle`/`onUpdateEdgeStyle` роблять ТІЛЬКИ shallow-мердж
  верхнього рівня — патч `{text: {...}}` вичистив би поля `text`, яких
  немає в конкретному патчі. Тому нові `onUpdateNodeTextStyle`/
  `onUpdateEdgeTextStyle` (і окремі `onResetNodeTextStyle`/
  `onResetEdgeTextStyle`, що чистять лише `text`, лишаючи fill/stroke)
  мерджять саме вкладений `text`-об'єкт.
- UI: новий спільний `TextStyleSection.tsx` (font-size select, B/I
  кнопки, color-picker, align-кнопки — тільки для вузла, Reset text) —
  використовується і в `PropertiesPanel.tsx` (вузол), і в
  `LinksPanel.tsx` (ребро, з `idSuffix` через кілька рядків лінків).
- Нові тести: Go `layout_test.go` (Text round-trip), web unit
  `shapes.test.ts`/`svgExport.test.ts` (резолв + SVG-рендер тексту
  вузла й ребра), e2e `text-style.spec.ts` (5: зміна розміру/жирності/
  кольору на канві + YAML незмінний + SVG-експорт той самий стиль;
  Export→Import layout; Reset text; align left/center/right; edge-лейбл
  розмір/колір).
- Регресія: `go test ./...`, `go vet ./...`, `./dc validate
  examples/*.dc.yaml`, `make wasm && make wasm-test` — усе OK; `npm
  test` (100 passed), `npm run build`, `npx playwright test` —
  111/115 passed, 3 skipped (drawio), 1 pre-existing failure
  (drill-down, з кроку 12.3, не зачеплено цим кроком).
- Commit: phase12-step5: налаштування тексту вузлів і лейблів ребер

## phase12-step6 — Об'єднання Links у Properties (контекстна панель) — 2026-07-19

- `RightDock.tsx`: вкладки тепер Properties/Flows/YAML (Links немає,
  History додасться в 12.13). Пропси `linksContent` більше немає.
- Стара `LinksPanel.tsx` (список + фільтри + inline-розгортання форми)
  видалена, розбита на два нові компоненти:
  - `LinkProperties.tsx` — форма властивостей ОДНОГО лінка (from/to/
    type/label/hide-label/Style/Text/Delete), той самий патерн, що
    `PropertiesPanel.tsx` для вузла; testid'и без індексу (`link-edit-
    color`, не `link-edit-color-0`), бо в контексті Properties одразу
    видно щонайбільше один лінк, як і для вузла.
  - `DiagramOverview.tsx` — стан «нічого не вибрано»: назва/purpose
    діаграми + компактний фільтрований список вузлів (`overview-node-
    ${id}`) і лінків (`overview-link-${index}`, з двостороннім hover-
    підсвічуванням канви, як раніше). Клік вибирає елемент і Properties
    перемикається на його форму.
  - `EditorWorkspace.tsx`: `propertiesContent` — тристороння умова
    (`selectedNode ? PropertiesPanel : selectedLink ? LinkProperties :
    DiagramOverview`), обидва ефекти перемикання дока (на вибір вузла
    і на вибір лінка) тепер ведуть в `'properties'`.
- **Знайдена пастка:** клік по вузлу й клік по ребру НЕ скидали одне
  одного (`selectedNodeId`/`selectedLinkIndex` — незалежні стани,
  раніше безпечно, бо жили в різних вкладках дока). Після об'єднання в
  одну вкладку виграш пріоритету (вузол > лінк) без явного скидання
  дав би застряглий вибір лінка, що не показується, поки вручну не
  скинути. Фікс: `onNodeClick` скидає `selectedLinkIndex`,
  `onEdgeClickRecord`'s select-branch скидає `selectedNodeId`/`Ids`.
- **Ще одна пастка:** клік по рядку лінка в оглядовому списку одразу
  розмонтовує список (Properties перемикається на форму лінка) — той
  самий DOM-вузол, чий `onMouseLeave` мав би зняти hover-підсвітку,
  зникає ДО того, як подія встигає спрацювати, тож `hoveredLinkIndex`
  застрягав. Фікс: клік явно скидає hover (`onHoverLink(null)`) поряд
  із вибором лінка.
- Спеки адаптовано (без зміни їхньої мети): `edge-style.spec.ts`,
  `edge-marker-parity.spec.ts`, `links.spec.ts`, `text-style.spec.ts`
  (крок 12.5) — `openDock(page,'links')` + `link-item-N` прибрано,
  замінено на клік по ребру на канві або `overview-link-N`, всі
  `link-edit-*-N`/`link-text-*-N` тестіди без індексу;
  `multi-select.spec.ts` — `properties-empty` замінено на
  `diagram-overview`.
- Регресія: `npm test` (100 passed), `npm run build`, `npx playwright
  test` — 111/115 passed, 3 skipped (drawio), 1 pre-existing failure
  (drill-down, з кроку 12.3, не зачеплено цим кроком).
- Commit: phase12-step6: об'єднання Links у контекстну панель Properties

## phase12-step7 — Приховування конектів і текстів вузлів — 2026-07-19

- Go `internal/layout`: `View.HiddenEdges []string` (link-keys) і
  `HiddenNodeLabels []string` (id вузлів) поруч із наявним
  `HiddenEdgeLabels`; `Save` уже round-трипить весь `View` (без
  пофайлового розбору полів для нових масивів окремо — додано лише в
  явний список полів, що копіюються). Схема + `TestSavePreservesWebEditorOnlyFields`
  розширені.
- Веб-дзеркало: `layoutFile.ts` (`hiddenEdges`/`hiddenNodeLabels` у
  `LayoutFile`/`BuildLayoutFileInput`/`LayoutFileSource`),
  `useDiagramStack.ts` (`DiagramLevel.hiddenEdges/hiddenNodeLabels`,
  round-трип у buildLevel/onOpenNative/onRestoreAutosave/share-link),
  `localAutosave.ts` (`AutosaveData`). **Критична точка, яку step 11.8
  вже раз ловив на цьому самому — `onImportLayout`
  (`useDiagramEditing.ts`, «Import layout» пункт меню) — окрема від
  `onOpenNative`, легко пропустити:** додано мердж і туди.
- Канва (`FlowCanvas.tsx`): приховане ребро повністю виключається з
  `rfEdges` (лінія + маркер + лейбл — не рендериться взагалі, а не
  просто ховається стилями); вузол з прихованим лейблом рендерить
  фігуру без тексту (`DcNodeData.labelHidden`, `NodeShell` в
  rfNodeTypes.tsx). SVG-експорт (`svgExport.ts`) — та сама логіка:
  `layout.edges` фільтрується перед рендером, `hiddenNodeLabels`
  пропускає лише `<text>` лейбла вузла.
- UI: чекбокс «Hide connection» у `LinkProperties.tsx`, «Hide label» у
  `PropertiesPanel.tsx`; `DiagramOverview.tsx` позначає приховані лінки
  бейджем 🙈.
- **Знайдені пастки:** (1) клік по вузлу й клік по ребру далі не
  скидали `selectedLinkIndex`/`selectedNodeId` одне одного повністю —
  Escape теж їх не чіпав (`useDiagramEditing.ts`'s keydown-хендлер
  скидав лише `selectedNodeId`/`Ids`) — додано `setSelectedLinkIndex(null)`.
  (2) Escape — узагалі no-op, поки фокус лишається на чекбоксі/іншому
  editable-елементі (`isEditableTarget`-гвард, свідомо з кроку 7.2) —
  зафіксовано в e2e-тесті явним `.blur()` перед Escape, а не як баг.
- Нові тести: Go `layout_test.go` (round-trip нових полів), web unit
  `svgExport.test.ts` (3: приховане ребро зникає повністю; видиме ребро
  не зачіпається чужим hiddenEdges; прихований лейбл вузла — фігура без
  тексту), e2e `hide-elements.spec.ts` (4: hide/unhide конекта +
  YAML/SVG незмінні, Export→Import зберігає, бейдж 👁 в огляді,
  hide/unhide лейбла вузла + SVG).
- Регресія: `go test ./...`, `go vet ./...`, `./dc validate
  examples/*.dc.yaml`, `make wasm && make wasm-test` — OK; `npm test`
  (103 passed), `npm run build`, `npx playwright test` — 115/119
  passed, 3 skipped (drawio), 1 pre-existing failure (drill-down, з
  кроку 12.3, не зачеплено цим кроком).
- Commit: phase12-step7: приховування конектів і текстів вузлів

## phase12-step8 — Core view: режим «показати все приховане» — 2026-07-19

- `useViewSettings.ts`: `coreView` (localStorage `dc.ui.coreView`,
  той самий трафарет, що grid/snap); View-меню
  `menu-core-view-toggle`.
- `FlowCanvas.tsx`: приховане ребро (`hiddenEdges`) і прихований лейбл
  вузла (`hiddenNodeLabels`) більше НЕ фільтруються, коли `coreView`
  увімкнено — рендеряться як «примара» (`isGhost`/`labelGhost`):
  напівпрозоро (opacity 0.4/0.35), пунктирна лінія для ребра, бейдж 👁
  (`rf-edge-ghost-badge-*`/`rf-node-ghost-badge-*`), і лишаються
  повністю клікабельними — клік по ghost-ребру відкриває його
  властивості так само, як по звичайному. `hiddenEdgeLabels` (лейбл
  ребра, з 11.9) теж примусово показується в Core view.
  SVG-експорт (`svgExport.ts`) НЕ отримав жодного нового параметра —
  Core view свідомо не проникає в `RenderOptions`, тож експорт завжди
  малює звичайний (не-Core) вигляд, як і вимагав AC.
- Нові тести: e2e `core-view.spec.ts` (2: ввімкнути Core view →
  прихований конект і лейбл вузла видимі напівпрозоро з бейджем; клік
  по ghost-конекту відкриває Properties; зняти Hide прямо в Core view;
  вимкнути Core view → досі прихований лейбл знову ховається; SVG-
  експорт при ввімкненому Core view не містить прихованих елементів).
- Регресія: `npm test` (103 passed), `npm run build`, `npx playwright
  test` — 117/121 passed, 3 skipped (drawio), 1 pre-existing failure
  (drill-down, з кроку 12.3, не зачеплено цим кроком).
- Commit: phase12-step8: Core view — показ прихованих елементів примарою

## phase12-step9 — Шари: z-порядок вузлів — 2026-07-19

- Go `internal/layout.View.ZOrder []string` (bottом-to-top, не
  обов'язково всі id) + схема + `Save` round-трип + тест.
- Новий спільний `web/src/zOrder.ts` — єдине джерело правди для
  резолву порядку, яким користуються і канва, і SVG-експорт:
  - `resolveZOrder(nodeIds, zOrder)` — часткова, можливо застаріла
    (id видалені/додані з моменту останньої z-order-дії) явна
    послідовність групується в один суцільний блок на позиції першого
    явного id в дефолтному порядку; решта — на своїх місцях.
  - `resolveDrawOrder(nodes, zOrder)` — те саме, але DFS по дереву
    parent/children, тож контейнер ЗАВЖДИ малюється одразу перед
    своїми нащадками незалежно від zOrder (інваріант кроку 11.6:
    zOrder впорядковує лише в межах одного рівня вкладеності).
  - `applyZOrderOp(nodeIds, zOrder, ids, op)` — Bring to front/forward,
    Send backward/to back; мультивиділення рухається як єдиний блок
    (forward/backward — по одному сусідньому невиділеному id за раз).
    Кожна дія персистить ПОВНИЙ поточний резолвлений порядок (не лише
    зачеплені id) — наступний резолв стає просто дрейф-корекцією.
- Канва (`FlowCanvas.tsx`): `zIndexById` з `resolveDrawOrder` стає RF
  `zIndex` кожного вузла. SVG-експорт (`svgExport.ts`) використовує
  той самий `resolveDrawOrder` для порядку `<g>`-елементів.
- UI: Edit-меню (Bring to front/forward, Send backward/to back,
  disabled без виділення) + мінімальне контекстне меню правого кліку
  по вузлу (`NodeContextMenu.tsx`) з тими самими z-order-пунктами +
  Delete/Duplicate — right-click поза поточним мультивиділенням
  замінює виділення на клікнутий вузол.
- Всі точки round-trip (buildLevel/onOpenNative/onImportLayout/
  onRestoreAutosave/share-link/onSave/onShare) оновлені тим самим
  списком, що й hiddenEdges/hiddenNodeLabels у кроці 12.7 — на
  відміну від `hidden*` (Set, union-мердж), `zOrder` — список, і нова
  порція ЗАМІНЮЄ стару (вона вже сама по собі повний знімок).
- Нові тести: Go `layout_test.go` (round-trip ZOrder), web unit
  `zOrder.test.ts` (12: resolve/apply/draw-order, зокрема інваріант
  контейнер-під-дітьми), `svgExport.test.ts` (порядок `<g>` за
  замовчуванням і з zOrder), e2e `z-order.spec.ts` (3: Send to back
  міняє zIndex на канві й порядок у SVG-експорті, виживає Save→Open;
  діти контейнера завжди над ним; контекстне меню відкривається і
  працює).
- Регресія: `go test ./...`, `go vet ./...`, `./dc validate
  examples/*.dc.yaml`, `make wasm && make wasm-test` — OK; `npm test`
  (116 passed), `npm run build`, `npx playwright test` — 120/124
  passed, 3 skipped (drawio), 1 pre-existing failure (drill-down, з
  кроку 12.3, не зачеплено цим кроком).
- Commit: phase12-step9: шари — z-порядок вузлів (zOrder)

## phase12-step10 — Власні картинки — 2026-07-19

- Go `internal/layout.Style.Image string` (шлях, ніколи data URI) +
  схема + `Save` round-трип (частина непрозорого `Styles`-мапу, як
  `Text`) + тест.
- Веб-дзеркало: `shapes.ts` (`StyleOverride.image`/
  `ResolvedNodeStyle.image`, `resolveNodeStyle` резолвить — інстанс
  тільки, без custom_types-рівня), `layoutFile.ts`
  (`LayoutStyle.image`).
- **Відхилення від плану** (детально в `docs/deviations.md`, крок
  12.10): File System Access API в проєкті працює лише з окремими
  file-handle (без директорійного доступу) — «мовчки скопіювати в
  assets/» неможливо; «Save as zip» для картинок теж не існувало.
  Замість цього: шлях у layout-файлі лишається як і задумано, реальні
  байти живуть у сесійному `DiagramLevel.imageAssets` (шлях → data
  URL); додавання картинки одразу пропонує native save-picker (де
  користувач сам може зберегти в assets/) або звичайний download.
  Свіже відкриття без цього файлу під рукою — шлях лишається валідним,
  вузол малює фігуру як завжди + примітка в Properties (не в
  Problems-панелі — вона прив'язана до Go-валідації YAML, а
  відсутність картинки суто layout-стан).
- Канва (`rfNodeTypes.tsx`'s `NodeShell`): картинка малюється ЗАМІСТЬ
  dc-type фігури (draw.io "image node" стиль) — `object-fit: contain`,
  лейбл підписом знизу; ресайз вузла масштабує картинку природно (той
  самий flex-контейнер). SVG-експорт (`svgExport.ts`) — той самий
  макет, `<image href="data:...">` замість фігури; шлях НІКОЛИ не
  потрапляє в експортований SVG (тільки резолвлений data URI).
- UI: секція Image в `PropertiesPanel.tsx` (file input, прев'ю або
  примітка «не доступно в цій сесії», Remove image) — 2MB ліміт з
  `setLoadError`-тостом при перевищенні.
- Нові тести: Go `layout_test.go` (round-trip Image), web unit
  `svgExport.test.ts` (data-URI замість шляху; вузол без резолву
  малює фігуру, не падає), e2e `node-image.spec.ts` (2: додати
  картинку → видно на канві + прев'ю, Export layout містить шлях НЕ
  data-URI, SVG-експорт містить data-URI НЕ шлях, Remove прибирає;
  відкриття layout з посиланням на відсутній файл не падає + показує
  фігуру звичайно + примітку).
- Регресія: `go test ./...`, `go vet ./...`, `./dc validate
  examples/*.dc.yaml`, `make wasm && make wasm-test` — OK; `npm test`
  (117 passed), `npm run build`, `npx playwright test` — 122/126
  passed, 3 skipped (drawio), 1 pre-existing failure (drill-down, з
  кроку 12.3, не зачеплено цим кроком).
- Commit: phase12-step10: власні картинки вузлів

## phase12-step11 — Групування виділеного — 2026-07-19

- Ctrl/Cmd+G (`useDiagramEditing.ts`, `onGroupSelected`/`canGroupSelected`):
  з >=2 виділених вузлів з ОДНАКОВИМ `parent` (undefined теж рахується
  як спільний) створює новий `type: component` контейнер `group-N`,
  переставляє `parent:` кожного вибраного на нього; позиція/розмір
  контейнера обчислюються з поточних абсолютних bbox виділення + 32px
  падінг, комітяться в layout окремо від структурної операції (щоб
  щойно створений контейнер одразу мав правильний bbox, а не
  чекав ре-лейауту). Один YAML-коміт (addNode + N×updateNode
  parent) — Undo прибирає всю групу одним кроком.
- Ctrl/Cmd+Shift+G (`onUngroupSelected`/`canUngroupSelected`):
  вибраний вузол має дітей (`some(n => n.parent === selectedNodeId)`)
  → їхній `parent` переставляється на дідуся контейнера (або
  прибирається), сам контейнер видаляється — один YAML-коміт.
- Пункти Group/Ungroup додані і в Edit-меню (`AppHeader.tsx`), і в
  right-click `NodeContextMenu.tsx` (нова опційна секція, рендериться
  тільки коли передані `onGroup`/`onUngroup`).
- Блокування різнорівневого групування: `canGroupSelected` вимагає
  однакового `parent` у ВСІХ виділених — рубербенд, що зачепив і
  контейнер, і його ж дитину (різні рівні вкладеності), лишає пункт
  Group disabled в Edit-меню (AC це вимагав явно).

### Знайдений і виправлений продакшн-баг (не тестова методологія)

Під час написання e2e (`group.spec.ts`, тест «dragging it moves
both») виявилось, що перетягування БУДЬ-ЯКОГО контейнера (не тільки
щойно створеної групи) насправді НЕ рухає його дітей — вони лишаються
на місці. Існуючий тест `containers.spec.ts` («dragging a container
moves its children together») хибно проходив і раніше: він порівнював
лише offset дитина-контейнер до/після, а не факт реального зсуву — і
цей offset тривіально лишається незмінним, якщо ні контейнер, ні
дитина взагалі не зрушили (drag не спрацював через click, що влучив
у дочірній вузол, а не в контейнер, — сам контейнер у тому тесті
теж фактично не рухався). Додано явну перевірку `afterContainer.x >
beforeContainer.x + 20`, яка одразу відловила реальну відсутність
руху дітей.

Корінна причина: `computeLayout()` (`layout.ts`) навмисно повертає
АБСОЛЮТНІ x/y для кожного вузла, включно з дітьми контейнера (так
задокументовано в коментарі функції). `FlowCanvas.tsx` рендерить
дитину з позицією, відносною до контейнера: `abs(дитина) -
abs(контейнер)`. Коміт драгу контейнера (`onNodeDragStop` →
`useDiagramEditing.ts`'s `onNodeDrag`) оновлював `positions[containerId]`
без зміни `positions[childId]` — на наступному рендері відносна
позиція дитини перераховувалась так, що САМЕ компенсувала зсув
контейнера, і дитина візуально лишалась на старому місці незалежно
від того, наскільки далеко потягли контейнер.

Виправлення в `FlowCanvas.tsx`'s `handleNodeDragStop`: якщо
перетягуваний вузол — контейнер (і не змінює власного `parent`),
дельта його переміщення застосовується до збережених абсолютних
позицій УСІХ нащадків (рекурсивно, через `geometry.childrenOf`), і
весь набір комітиться одним викликом `onGroupDragStop` (той самий
шлях, що вже використовує групове перетягування multi-selection) —
одна історична подія замість N окремих.

Додатково (менш критичний супутній фікс): React Flow вимагає, щоб
батьківський вузол з'являвся в масиві `nodes` РАНІШЕ за своїх дітей,
інакше drag-каскад під час самого жесту (до drag-stop) не працює.
`diagram.nodes` цього не гарантує — щойно створена група додається
`addNode`-ом У КІНЕЦЬ масиву, вже ПІСЛЯ вузлів, що щойно стали її
дітьми. Додано `depthOrderedNodes` (сортування `layout.nodes` за
глибиною вкладеності, стабільне) перед побудовою `rfNodes`.

- Нові тести: e2e `group.spec.ts` (3: Ctrl+G групує + драг переміщує
  обох дітей разом (перевірка через `exportLayout()` — canvas-space
  позиції, а не screen-space boundingBox, який зсувається через
  `fitView` при кожній зміні кількості вузлів) + Undo прибирає групу
  одним кроком; Ungroup повертає дітей без зсуву і прибирає контейнер;
  групування різнорівневого виділення заблоковано). Посилено
  `containers.spec.ts`'s наявний тест реальною перевіркою зсуву
  контейнера (виправляє попередній хибний позитив).
- Регресія: `go test ./...`, `go vet ./...`, `./dc validate
  examples/*.dc.yaml` — OK; `npm test` (117 passed), `npm run build`,
  `npx playwright test` — 125/129 passed, 3 skipped (drawio), 1
  pre-existing failure (drill-down, з кроку 12.3, не зачеплено цим
  кроком).
- Commit: phase12-step11: групування виділеного

## phase12-step12 — Copy/paste + вирівнювання/розподіл — 2026-07-20

- Cmd/Ctrl+C/X/V (`useDiagramEditing.ts`): clipboard — `useState`,
  НЕ прив'язаний до жодної вкладки (єдиний екземпляр хука на весь
  застосунок), тому працює між вкладками як справжній clipboard.
  Copy знімає повний знімок вибраних вузлів + лінків МІЖ ними (лінк
  до вузла поза виділенням — dangling після вставки — відкидається) +
  їхніх positions/sizes/styles. Paste генерує нові унікальні id (та
  сама схема `-copy`/`-copy2`, що Duplicate), ремапить `parent:` (якщо
  батько теж скопійований) і обидва кінці кожного скопійованого лінка,
  зсуває позиції +40/+40 від ОРИГІНАЛЬНИХ (на момент копіювання)
  координат, один `applyOps` виклик (addNode×N + addLink×M) → один
  undo-крок; розміри/стилі мерджаться в layout-стан ЦІЛЬОВОЇ вкладки
  окремим `updateCurrentLevel` після резолву (той самий патерн, що
  Group). Cut = Copy + Delete (перевикористовує наявний
  onDeleteSelectedNode з його confirm-діалогом для вузлів із
  залежностями).
- Align (`onAlignSelected`) / Distribute (`onDistributeSelected`):
  left/center/right/top/middle/bottom і horizontal/vertical — один
  `updateCurrentLevel({positions: ...})` виклик на всю операцію
  (той самий патерн групового драгу 11.10). Align — відносно bbox
  усього виділення; Distribute — рівні проміжки між краями (сортує
  за відповідною віссю, перший/останній лишаються на місці).
  Requires ≥2 (align) / ≥3 (distribute) вибраних.
- UI: Edit-меню (`AppHeader.tsx`) — Copy/Cut/Paste + 6 align + 2
  distribute пункти. Right-click меню (`NodeContextMenu.tsx`) —
  та сама секція align/distribute (copy/paste лишились тільки в
  Edit-меню + шорткати, план явно вимагав контекстне меню тільки для
  вирівнювання).
- Шорткати не спрацьовують у текстових полях — той самий
  `isEditableTarget`-guard (11.10), перевірено e2e і на реальному
  CodeMirror-полі YAML-панелі (`.cm-content`, `isContentEditable`),
  не тільки на прихованому `yaml-source`-проксі, який лише читає
  стан для тестів.
- Відхилення від AC (див. `docs/deviations.md`): «undo повертає
  позиції одним кроком» для Align/Distribute НЕ реалізовано в цьому
  кроці — layout-only мутації (як і звичайний драг/ресайз) не
  потрапляють в поточний rawText-скопований undo-стек; це саме
  завдання кроку 12.13 (History refactor), яке вирішить це одразу
  для всіх layout-операцій, а не тільки для цих двох.
- Нові тести: e2e `copy-paste.spec.ts` (3: копіювання 2 зв'язаних
  вузлів + стиль → вставка дає 2 нові вузли з лінком і збереженим
  стилем, undo одним кроком; вставка на іншій вкладці; Cut =
  copy+delete), `align-distribute.spec.ts` (4: Align top вирівнює y;
  Distribute horizontally дає рівні проміжки; пункти меню disabled
  без достатньої кількості вибраних; шорткати не спрацьовують у
  CodeMirror YAML-полі).
- Регресія: `go test ./...`, `go vet ./...`, `./dc validate
  examples/*.dc.yaml` — OK; `npm test` (117 passed), `npm run build`,
  `npx playwright test` — 132/136 passed, 3 skipped (drawio), 1
  pre-existing failure (drill-down, з кроку 12.3, не зачеплено цим
  кроком).
- Commit: phase12-step12: copy/paste + вирівнювання/розподіл

## phase12-step13 — Панель History — 2026-07-20

- **Рефактор історії** (`useDiagramStack.ts`): замінено пару стеків
  `{past: string[], future: string[]}` на єдину лінійну шкалу
  `{steps: HistoryStep[], cursor: number}`, де кожен `HistoryStep` —
  ПОВНИЙ знімок (`{label, at, rawText, layoutSnapshot}`), а не diff;
  `layoutSnapshot` — той самий JSON, що `layoutSnapshotOf` уже виводить
  для dirty-tracking (12.3), тож не знадобився новий формат серіалізації.
  `steps[0]` завжди — checkpoint одразу після відкриття вкладки
  (лейбл "Open"), сідиться лениво в `historyFor(fileName, level)` при
  першому зверненні до вкладки. Undo/Redo/клік по запису в History —
  один і той самий примітив `jumpToHistoryStep(index)`: рухає `cursor`
  і повністю ЗАМІНЮЄ layout-стан вкладки через новий
  `layoutFileToLevelPatch` (`layoutFile.ts`, точний inverse
  `buildLayoutFileFromLevel`) — на відміну від старого позиційного
  undo (тільки `positions`), тепер відновлюються styles/sizes/
  edgeStyles/hidden*/zOrder/renderStyle теж.
- **Кожна мутація тепер пушить іменований крок**: `updateCurrentLevel`
  отримав опційний `historyLabel` — коли переданий, після мержу
  комітить `pushHistory(label, merged)`. Усі layout-only мутації
  (drag/resize/style/text/hide/z-order/align/distribute/edge-label-
  drag/image set-remove/re-layout/import-layout), які РАНІШЕ взагалі
  не потрапляли в historyRAW, тепер undoable — головна мета кроку.
  `applyOps`/`applyTextReplace` (структурні YAML-правки) генерують
  лейбл через новий `describePatchOps` (`yamlPatch.ts`) — розпізнає
  addNode/removeNode/addLink/removeLink/updateNode(label→«Edit label
  a→b»)/групування (addNode+N×updateNode parent→«Group N nodes»)/
  paste (addNode+addLink→«Paste N nodes») з фолбеком «Edit diagram
  (N changes)» для нерозпізнаних комбінацій. Мультивузлові
  жести (групове перетягування, paste-мердж стилів/розмірів після
  applyOps, group-creation post-resolve size-set) навмисно НЕ пушать
  другий крок — один History-запис на один жест користувача.
- **Панель History** (`HistoryPanel.tsx`, нова 4-та вкладка дока
  `RightDock.tsx`): плаский список знизу вгору (`steps[0]` найстаріший
  першим), поточний підсвічений (accent-бордер, жирний), кроки після
  cursor (redo-гілка) — притлумлені (opacity 0.6). Клік по будь-якому
  запису викликає `jumpToHistoryStep` напряму — недеструктивно (redo-
  гілка лишається, доки нова правка з середини не обріже її, як і
  раніше в undo).
- `useHistory.ts` спрощено до тонкої обгортки над
  `jumpToHistoryStep(cursor±1)` + глобальний Ctrl/Cmd+Z шорткат.

### Знайдений і виправлений баг (тестова методологія, не продакшн)

Написання e2e для History виявило: клік по щойно доданому через
палітру вузлу («User» одразу після drop нового вузла) міг застосувати
наступну зміну стилю НЕ до того вузла, що очікувалось — сам drop
синхронно виділяє новододаний вузол (`onDropNodeType`'s
`setSelectedNodeId`), а звичайний клік по іншому вузлу коммітить
виділення з де-факто затримкою ~250ms (де-дублювання
click/dblclick, `FlowCanvas.tsx`, задокументовано ще в 12.4) — тест,
що клікав і одразу заповнював колір без очікування, застосовував колір
до СТАРОГО виділення. Виправлено очікуванням, що `properties-panel`
показує саме потрібний `Node: <id>` (не просто `toBeVisible()`, який
не відрізняє "вже видимий для іншого вузла" від переходу) — не
продакшн-баг, сама механіка виділення коректна.

### Оновлені існуючі тести під нову (правильнішу) грануляцію undo

`notes.spec.ts` і `group.spec.ts` мали тести виду «одна дія додає щось
+ один драг → один Undo прибирає ВСЕ» — коректно за старою моделлю
(драг взагалі не потрапляв в історію), але НЕ за новою (кожен жест —
свій крок). Оновлено на два послідовні Undo з проміжною перевіркою
(спочатку відкочується драг, потім структурна дія) — саме та
поведінка, якої й вимагав цей крок.

- Нові тести: e2e `history-panel.spec.ts` (1: 4 різнотипні правки →
  History показує 5 записів (разом з "Open"), клік по першому
  повертає canvas-стан ПОВНІСТЮ — і позицію, і колір; клік по
  останньому — знову вперед, обидва без втрати redo-гілки). Unit
  `yamlPatch.test.ts` не чіпався (нова `describePatchOps` — покрита
  опосередковано через e2e-мітки; окремих unit-тестів на неї не
  додавалося, приймальні критерії покриваються e2e).
- Регресія: `go test ./...`, `go vet ./...`, `./dc validate
  examples/*.dc.yaml` — OK; `npm test` (117 passed), `npm run build`,
  `npx playwright test` — 133/137 passed, 3 skipped (drawio), 1
  pre-existing failure (drill-down, з кроку 12.3, не зачеплено цим
  кроком).
- Commit: phase12-step13: панель History

## phase12-step14 — Полірування + фінальна регресія фази — 2026-07-20

- Tour (`Tour.tsx`): додано 7 нових тіпів під фічі кроків 12.4–12.13
  (інлайн-редагування/F2, статус збереження + Auto-save, приховування +
  Core view, right-click контекстне меню, групування + copy/paste,
  align/distribute, кастомні картинки, панель History) — без зміни
  формату/тестованої поведінки (`tour.spec.ts` не хардкодить кількість
  тіпів).
- `docs/format.md`: секція Layout-файлу доповнена прикладом і описом
  полів, доданих за фазу 12 — `styles[].text`/`.image`,
  `edgeStyles[].text`, `hiddenEdges`, `hiddenNodeLabels`, `zOrder` (і
  явно зазначено, що останні три, як і вже задокументований
  `hiddenEdgeLabels`, ніколи не потрапляють у `dc context`/AI-експорт).
- Огляд right-click контекстного меню (`NodeContextMenu.tsx`): усі
  пункти фази 12 присутні — z-order (front/forward/backward/back),
  Group/Ungroup, 6× Align, 2× Distribute, Duplicate/Delete;
  disabled-стани коректні (Group/Ungroup/Align/Distribute — залежно
  від `canGroup`/`canUngroup`/`canAlign`/`canDistribute`, як і в
  Edit-меню). Copy/Cut/Paste залишились тільки в Edit-меню й на
  шорткатах — так було явно визначено в кроці 12.12 (план вимагав
  контекстне меню лише для вирівнювання), підтверджено повторно.
- Фінальна регресія фази (усі пункти AC кроку 12.14): `go test ./...`,
  `go vet ./...`, `./dc validate examples/*.dc.yaml`, `make wasm &&
  make wasm-test` — усе OK, `dc.wasm`/`wasm_exec.js` без дрейфу після
  ребілду; `npm test` (117 passed), `npm run build`, повний `npx
  playwright test` — 133/137 passed, 3 skipped (drawio), 1
  pre-existing failure (drill-down, з кроку 12.3, ніколи не
  зачіплялась жодним кроком фази 12).

**Фаза 12 (PLAN4.md) завершена — усі 14 кроків (12.1–12.14)
пройдено послідовно, з регресією й записом прогресу після кожного.**
- Commit: phase12-step14: полірування + фінальна регресія фази
