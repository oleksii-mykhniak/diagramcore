/** Persistent "what was open" session record — separate from
 * `localAutosave.ts` (which persists per-file editable content). Fixes the
 * bug where a page reload lost the open document entirely: the editable
 * content was safe in `dc-autosave`, but nothing remembered that a document
 * had been open at all, so the editor came back empty until the user
 * reopened the file by hand. This store instead remembers the shape of the
 * open session (which tree was open, which tabs, which was active, and the
 * native file handles if any) so it can be silently reconstructed on the
 * next load. A single record, overwritten on every change — there is only
 * ever one "current session". */

const DB_NAME = 'dc-session';
const DB_VERSION = 1;
const STORE = 'session';
const KEY = 'current';

export interface SessionRecord {
  mainFileName: string;
  /** Raw text of every file that was part of the open tree at the time it
   * was last written — the same shape `openFiles`/`onOpenNative` build from
   * a picker. Used to reconstruct tabs whose own content isn't otherwise
   * recoverable (a details sub-diagram never gets its own autosave entry
   * unless it was the active tab at some point). */
  virtualFS: Record<string, string>;
  openTabs: string[];
  activeTab: string | null;
  /** Only set when the main file was opened via the native File System
   * Access picker — lets a reload silently reread the latest content from
   * disk instead of relying on the (possibly stale) `virtualFS` snapshot. */
  mainHandle?: FileSystemFileHandle;
  layoutHandle?: FileSystemFileHandle | null;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
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

export async function saveSession(data: Omit<SessionRecord, 'savedAt'>): Promise<void> {
  const record: SessionRecord = { ...data, savedAt: Date.now() };
  await withStore('readwrite', (store) => store.put(record, KEY));
}

export async function loadSession(): Promise<SessionRecord | null> {
  const result = await withStore<SessionRecord | undefined>('readonly', (store) => store.get(KEY));
  return result ?? null;
}

export async function clearSession(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(KEY));
}

export const SESSION_DEBOUNCE_MS = 500;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounces session writes the same way `scheduleAutosave` debounces
 * per-file content — tab switches and opens happen in quick bursts (e.g.
 * opening a tree eagerly opens every reachable details tab), and only the
 * final shape matters. */
export function scheduleSessionSave(data: Omit<SessionRecord, 'savedAt'>): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void saveSession(data);
  }, SESSION_DEBOUNCE_MS);
}
