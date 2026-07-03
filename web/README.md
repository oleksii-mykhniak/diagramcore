# DiagramCore — web editor

Browser editor for `*.dc.yaml` diagrams (see `../docs/format.md` and
`../docs/concept.md` for the format itself). React + TypeScript + Vite,
canvas on `@xyflow/react`, YAML editing via CodeMirror 6 + `yaml`
(eemeli/yaml), semantic validation via the Go validator compiled to WASM
(`public/dc.wasm`).

No server required: validation runs client-side, files are opened via the
File System Access API (with a plain file-input fallback), and diagrams
can be shared as a compressed URL fragment.

## Local development

From the repo root:

```
make wasm                # builds public/dc.wasm + public/wasm_exec.js
cd web
npm install
npm run dev              # http://localhost:5173
```

`npm run dev` does not run `scripts/generate-example-previews.mjs`
(that's a `prebuild` step, see below), so the example gallery's preview
images won't exist yet on a first checkout — run `npm run build` once,
or `npm run generate-previews` directly (requires the `dc` binary built
at the repo root: `go build -o dc ./cmd/dc`).

## Build

```
npm run build             # tsc -b && vite build; prebuild regenerates
                           # example-preview SVGs via the real `dc` binary
npm run preview           # serve dist/ locally to sanity-check the build
```

## Tests

```
npm test                  # vitest (unit)
npm run test:e2e          # playwright (e2e, against the production build —
                           # playwright.config.ts's webServer runs
                           # `npm run build && npm run preview`)
```

## Deployment

Deployed to GitHub Pages on every push to `main` via
`.github/workflows/deploy-web.yml`: builds the `dc` CLI and WASM
validator, builds the web app (including preview generation), runs the
full Playwright suite against the production build, and publishes
`web/dist`. See that workflow for the exact steps.

`vite.config.ts` uses a relative `base: './'` so the build works from any
path, including a GitHub Pages *project* site
(`https://<user>.github.io/<repo>/`) rather than a domain root.

**Site URL**: https://oleksii-mykhniak.github.io/diagramcore/
