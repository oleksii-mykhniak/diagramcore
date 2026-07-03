#!/usr/bin/env node
// Generates one SVG preview per examples/*.dc.yaml by shelling out to the
// real `dc render` binary (PLAN.md step 8.3) — previews are the actual
// rendered diagrams, not hand-drawn images. Runs before `vite build`
// (see package.json `prebuild`) so `public/example-previews/` is always
// fresh relative to `examples/`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const examplesDir = path.join(repoRoot, 'examples');
const outDir = path.join(__dirname, '..', 'public', 'example-previews');
const dcBinary = path.join(repoRoot, 'dc');

if (!fs.existsSync(dcBinary)) {
  console.error(`generate-example-previews: ${dcBinary} not found — run "go build -o dc ./cmd/dc" first`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(examplesDir).filter((f) => f.endsWith('.dc.yaml'));
for (const file of files) {
  const name = file.replace(/\.dc\.yaml$/, '');
  const outPath = path.join(outDir, `${name}.svg`);
  execFileSync(dcBinary, ['render', path.join(examplesDir, file), '-o', outPath]);
  console.log(`generated ${path.relative(repoRoot, outPath)}`);
}
