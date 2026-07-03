// Bundled example gallery (PLAN.md step 8.3): the actual examples/*.dc.yaml
// contents, embedded at build time so the gallery works without any
// server. Preview images are generated separately by
// scripts/generate-example-previews.mjs into public/example-previews/.
const modules = import.meta.glob('../../examples/*.dc.yaml', { query: '?raw', import: 'default', eager: true });

export interface ExampleEntry {
  fileName: string;
  text: string;
  previewUrl: string;
}

export const examples: ExampleEntry[] = Object.entries(modules)
  .map(([filePath, text]) => {
    const fileName = filePath.split('/').pop() as string;
    const base = fileName.replace(/\.dc\.yaml$/, '');
    return { fileName, text: text as string, previewUrl: `${import.meta.env.BASE_URL}example-previews/${base}.svg` };
  })
  .sort((a, b) => a.fileName.localeCompare(b.fileName));
