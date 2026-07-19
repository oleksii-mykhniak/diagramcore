/** File System Access helpers (PLAN.md step 8.1). Chromium-only; every
 * entry point here is feature-detected by the caller (`isNativeFsSupported`)
 * — Firefox/Safari fall back to the existing file-input/download flow. */

export function isNativeFsSupported(): boolean {
  return typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
}

const YAML_TYPES = [{ description: 'DiagramCore YAML', accept: { 'application/x-yaml': ['.yaml', '.yml'] } }];

export interface OpenedNativeFiles {
  mainHandle: FileSystemFileHandle;
  mainName: string;
  mainText: string;
  layoutHandle: FileSystemFileHandle | null;
  layoutText: string | null;
}

/** Opens a native file picker (multi-select) and sorts the result into a
 * core `*.dc.yaml` file plus its optional `*.layout.json` sibling, picked
 * by filename convention — the File System Access API has no way to
 * fetch an unselected sibling file automatically, so both must be
 * selected together (same UX as the existing multi-select file input). */
export async function openDiagramFiles(): Promise<OpenedNativeFiles | null> {
  if (!window.showOpenFilePicker) return null;
  const handles = await window.showOpenFilePicker({ multiple: true, types: YAML_TYPES });
  const layoutHandle = handles.find((h) => h.name.endsWith('.layout.json')) ?? null;
  const mainHandle = handles.find((h) => h !== layoutHandle);
  if (!mainHandle) return null;
  const mainText = await (await mainHandle.getFile()).text();
  const layoutText = layoutHandle ? await (await layoutHandle.getFile()).text() : null;
  return { mainHandle, mainName: mainHandle.name, mainText, layoutHandle, layoutText };
}

export async function writeTextToHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Binary counterpart of `writeTextToHandle` (PLAN4.md step 12.10) — a
 * custom node image's bytes, not text. */
export async function writeBlobToHandle(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function pickSaveHandle(suggestedName: string): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) return null;
  return window.showSaveFilePicker({ suggestedName, types: YAML_TYPES });
}

/** Save picker for a custom node image (PLAN4.md step 12.10) — no
 * YAML/JSON extension filter; `suggestedName` is conventionally under
 * `assets/`, but the picker still lets the user save anywhere. */
export async function pickImageSaveHandle(suggestedName: string): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) return null;
  return window.showSaveFilePicker({ suggestedName });
}
