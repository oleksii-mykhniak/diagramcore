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
