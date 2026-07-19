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
