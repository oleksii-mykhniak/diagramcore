import type { LayoutEdgeStyle, LayoutPosition, LayoutStyle, RenderStyle } from './layoutFile';

/** Local (per-browser) autosave (PLAN3.md step 11.3): a debounced
 * IndexedDB snapshot of the current level's editable state, keyed by
 * `fileName`. This is a safety net against an accidental reload/close
 * losing unsaved work — it's separate from Save (which writes the real
 * file/download) and is cleared whenever that happens for real. */
export interface AutosaveData {
  rawText: string;
  positions: Record<string, LayoutPosition>;
  notePositions: Record<string, LayoutPosition>;
  renderStyle: RenderStyle;
  /** Manually-resized node dimensions (PLAN3.md step 11.4). Optional so
   * records written before this field existed still decode. */
  sizes?: Record<string, { width: number; height: number }>;
  /** Instance-level style overrides (PLAN3.md step 11.8). Optional so
   * records written before this field existed still decode. */
  styles?: Record<string, LayoutStyle>;
  /** Instance-level edge style overrides (PLAN3.md step 11.9). Optional
   * so records written before this field existed still decode. */
  edgeStyles?: Record<string, LayoutEdgeStyle>;
  /** Edge label drag offsets (PLAN3.md step 11.9). Optional so records
   * written before this field existed still decode. */
  edgeLabelOffsets?: Record<string, LayoutPosition>;
  /** Individually-hidden edge label link-keys (PLAN3.md step 11.9).
   * Optional so records written before this field existed still decode. */
  hiddenEdgeLabels?: string[];
}

export interface AutosaveRecord extends AutosaveData {
  fileName: string;
  savedAt: number;
}

const DB_NAME = 'dc-autosave';
const DB_VERSION = 1;
const STORE = 'levels';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'fileName' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveAutosave(fileName: string, data: AutosaveData): Promise<void> {
  const record: AutosaveRecord = { fileName, ...data, savedAt: Date.now() };
  await withStore('readwrite', (store) => store.put(record));
}

export async function loadAutosave(fileName: string): Promise<AutosaveRecord | null> {
  const result = await withStore<AutosaveRecord | undefined>('readonly', (store) => store.get(fileName));
  return result ?? null;
}

export async function clearAutosave(fileName: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(fileName));
}

export const AUTOSAVE_DEBOUNCE_MS = 1000;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounces one save per `fileName` (PLAN3.md step 11.1 pattern: a rapid
 * sequence of edits — e.g. typing in the YAML panel — collapses to a
 * single write ~1s after the last one). */
export function scheduleAutosave(fileName: string, data: AutosaveData): void {
  const existing = pendingTimers.get(fileName);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    fileName,
    setTimeout(() => {
      pendingTimers.delete(fileName);
      void saveAutosave(fileName, data);
    }, AUTOSAVE_DEBOUNCE_MS),
  );
}

/** Cancels a pending debounced save without writing it — used when a
 * real Save or a fresh Open makes the pending autosave moot. */
export function cancelScheduledAutosave(fileName: string): void {
  const existing = pendingTimers.get(fileName);
  if (existing) {
    clearTimeout(existing);
    pendingTimers.delete(fileName);
  }
}
