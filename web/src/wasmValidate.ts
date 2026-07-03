// Loads the Go-compiled WASM module (public/dc.wasm, built by `make wasm`
// from cmd/wasm) and exposes its two exported globals — validate() and
// context() — as async TypeScript functions. public/wasm_exec.js (also
// produced by `make wasm`) is loaded via a plain <script> tag in
// index.html and defines the global `Go` class.

export interface ValidationError {
  file: string;
  line: number;
  code: string;
  message: string;
}

declare global {
  interface Window {
    Go: new () => {
      importObject: WebAssembly.Imports;
      run: (instance: WebAssembly.Instance) => Promise<void>;
    };
    validate: (yamlText: string) => ValidationError[];
    context: (yamlText: string) => string;
  }
}

let ready: Promise<void> | null = null;

function init(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const go = new window.Go();
      // Relative to BASE_URL (not the origin root) so this resolves
      // correctly when the app is served from a subpath, e.g. a GitHub
      // Pages project site (PLAN.md step 8.4).
      const resp = await fetch(`${import.meta.env.BASE_URL}dc.wasm`);
      const bytes = await resp.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
      // main() registers window.validate synchronously before parking on
      // select{}; go.run()'s promise only resolves on program exit, which
      // never happens here, so it is intentionally not awaited.
      void go.run(instance);
    })();
  }
  return ready;
}

/** Validates raw *.dc.yaml text; see internal/validate.ValidateString for
 * the exact rules applied (no filesystem access, so `details` sub-diagram
 * references are not followed in this mode). */
export async function validateDiagram(yamlText: string): Promise<ValidationError[]> {
  await init();
  return window.validate(yamlText);
}

/** Generates the same AI-context markdown as `dc context <file>` (non-deep;
 * see internal/context.Generate) for the given raw *.dc.yaml text. */
export async function generateContext(yamlText: string): Promise<string> {
  await init();
  return window.context(yamlText);
}
