// Smoke test for web/public/dc.wasm: loads the Go WASM validator under
// Node (using the Go-distributed wasm_exec.js) and checks that
// globalThis.validate(yamlString) returns [] for a valid diagram and a
// DC004 error for a known-broken one. Run with: node web/scripts/test-wasm.cjs
"use strict";

const fs = require("fs");
const path = require("path");

require(path.join(__dirname, "..", "public", "wasm_exec.js")); // defines globalThis.Go

const repoRoot = path.join(__dirname, "..", "..");
const wasmPath = path.join(__dirname, "..", "public", "dc.wasm");

const validYAML = fs.readFileSync(path.join(repoRoot, "examples", "payment-processing.dc.yaml"), "utf8");
const brokenYAML = fs.readFileSync(
	path.join(repoRoot, "internal", "validate", "testdata", "dc004_flow_no_link.dc.yaml"),
	"utf8"
);

async function main() {
	const go = new Go();
	const wasmBuffer = fs.readFileSync(wasmPath);
	const { instance } = await WebAssembly.instantiate(wasmBuffer, go.importObject);

	// main() registers globalThis.validate synchronously before blocking on
	// select{}; go.run()'s returned promise only resolves on program exit,
	// which never happens here, so it is intentionally not awaited.
	go.run(instance);

	if (typeof globalThis.validate !== "function") {
		throw new Error("globalThis.validate was not registered by the wasm module");
	}

	const validErrors = globalThis.validate(validYAML);
	if (!Array.isArray(validErrors) || validErrors.length !== 0) {
		throw new Error(`expected 0 errors for a valid diagram, got: ${JSON.stringify(validErrors)}`);
	}

	const brokenErrors = globalThis.validate(brokenYAML);
	if (!Array.isArray(brokenErrors) || !brokenErrors.some((e) => e.code === "DC004")) {
		throw new Error(`expected a DC004 error for the broken diagram, got: ${JSON.stringify(brokenErrors)}`);
	}

	console.log("OK: valid diagram -> 0 errors; broken diagram -> DC004");
	process.exit(0);
}

main().catch((err) => {
	console.error("FAIL:", err);
	process.exit(1);
});
