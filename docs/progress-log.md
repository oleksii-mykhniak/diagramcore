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
