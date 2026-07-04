---
name: design
description: Design system for the DiagramCore web editor (web/) — tokens, palette, spacing, typography, component rules. Read before styling any new component.
---

# DiagramCore web design system

Source of truth for tokens: `web/src/theme.css`. Every rule below must stay in
sync with that file — if you add/rename a token, update this doc in the same
commit.

## Rule: no inline hex, ever

New or touched components use **CSS classes and `var(--dc-*)` tokens only**.
Never write a hex/rgb literal in a component's inline `style` or in new CSS.
Enforced by `grep -rn "style={{[^}]*#[0-9a-fA-F]" web/src` — must stay empty
(cleared as of step 10.13's final AC — the whole tree is tokenized, not
just newly-touched components; keep it that way).

The only place raw colors are allowed to originate is `theme.css` itself
(the token definitions) and `svgExport.ts`'s `resolveThemeColors()` fallback
map (for jsdom/vitest, where `getComputedStyle` can't read CSS vars) — see
step 10.6.

## Themes

Two themes, switched via `data-theme` attribute on `<html>`:
`:root[data-theme='light']` (default) and `:root[data-theme='dark']`.
Selection persisted in `localStorage['dc.theme']`. Hook: `useTheme()` in
`web/src/hooks/useTheme.ts` — returns `[theme, setTheme, toggleTheme]`.
Switcher lives in the View menu (step 10.3); a temporary button
(`data-testid="theme-toggle"`) sits in the header until then.

Diagram render *style* (clean/sketch hand-drawn look, step 10.12) is a
**separate axis** from the UI theme — do not conflate the two. Render style
is stored in the layout file, not localStorage, and is chosen from the View
menu as "Diagram style".

## Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--dc-bg` | `#f7f7f8` | `#1e1e22` | page/app background |
| `--dc-surface` | `#ffffff` | `#2a2a2f` | panels, header, cards |
| `--dc-surface-muted` | `#f5f5f5` | `#232327` | secondary panel backgrounds |
| `--dc-border` | `#d0d0d5` | `#46464e` | hairline borders, dividers |
| `--dc-border-strong` | `#333333` | `#cfcfd6` | emphasized borders |
| `--dc-text` | `#1a1a1e` | `#e8e8ea` | primary text |
| `--dc-text-muted` | `#6b6b70` | `#9a9aa2` | secondary text, descriptions |
| `--dc-accent` | `#0066cc` | `#4da3ff` | links, selection, primary actions |
| `--dc-accent-hover` | `#0052a3` | `#6fb5ff` | accent hover state |
| `--dc-danger` | `#e04b4b` | `#ff6b6b` | destructive actions, errors |
| `--dc-flow-active` | `#e04b4b` | `#ff6b6b` | active flow step highlight |
| `--dc-flow-visited` | `#e08a4b` | `#f0a15c` | visited flow step highlight |
| `--dc-node-fill` | `#ffffff` | `#2a2a2f` | default node background |
| `--dc-node-border` | `#333333` | `#cfcfd6` | default node/edge stroke |
| `--dc-node-external-fill` | `#f5f5f5` | `#232327` | external-type node background |
| `--dc-shadow` | `0 1px 3px rgba(0,0,0,.12)` | `0 1px 3px rgba(0,0,0,.4)` | panel/dialog elevation |

Node/edge flow-highlight semantics (active/visited/selected) always resolve
through `--dc-flow-active` / `--dc-flow-visited` / `--dc-accent` — never
hardcode these per-component.

## Spacing

`--dc-space-1` through `--dc-space-6` = 4/8/12/16/24/32px. Use the token name,
not the pixel value, in new styles (`padding: var(--dc-space-2)`, not `8px`).

## Radii

`--dc-radius-sm` (2px, sharp corners — component/queue nodes),
`--dc-radius-md` (6px, default panels/buttons/service nodes),
`--dc-radius-lg` (12px, storage node bottom curve).

## Typography

`--dc-font-sans` — system font stack, used everywhere including `sketch`
style (step 10.12 roughens node/edge *geometry* only; a handwritten font
for sketch text was descoped — see `docs/deviations.md`, step 10.12 — so
both presets share this one token).
`--dc-font-size-sm` (11px — edge labels, secondary text),
`--dc-font-size-base` (13px — default UI/node text),
`--dc-font-size-lg` (18px — headings).

## Component rules

- **Nodes/edges** (`components/rfNodeTypes.tsx`, `components/rfEdgeTypes.tsx`):
  shape/geometry differs per type, but border/fill/text always come from
  tokens above. Flow state (active/visited/selected) is the *only* thing
  allowed to switch which token is used — never introduce a new color for it.
- **Panels/docks** (Properties, Links, Flows, Problems — step 10.4): background
  `--dc-surface`, border `--dc-border`, text `--dc-text`/`--dc-text-muted`.
- **Menus/toolbar** (step 10.3): background `--dc-surface`, hover state uses
  `--dc-surface-muted`, focus/active item uses `--dc-accent`.
- **Buttons**: default styling inherits surrounding surface; primary/destructive
  actions use `--dc-accent`/`--dc-danger` respectively.
- **testid stability**: never rename an existing `data-testid`. If a control
  moves (e.g. a button into a menu), keep its original testid on the new
  location; e2e specs should only need "open the menu/tab first" adjustments.

## Extending presets (render style)

Step 10.12 introduces `RenderStyle` presets (`clean`, `sketch`) via
`shapes.ts`'s `renderSvgInner(w, h, style)`. Adding a third preset later means
adding one more object to that style registry — no changes needed elsewhere,
since canvas and SVG export both draw through the same function. Keep new
presets token-driven for colors; only geometry/stroke-wobble/font may differ
structurally between presets.
