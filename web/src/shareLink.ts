import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import type { LayoutFile } from './layoutFile';

/** URL fragment share links (PLAN.md step 8.2): the core YAML + layout
 * are JSON-encoded, deflated (fflate), and base64url-encoded into
 * `#s=...` — never sent to a server (fragments aren't part of an HTTP
 * request), so this is purely client-side. */

const FRAGMENT_KEY = 's';
/** Human-facing size budget for the whole URL (PLAN.md step 8.2 AC). */
export const SHARE_URL_SIZE_LIMIT = 8 * 1024;

export interface ShareState {
  fileName: string;
  yaml: string;
  layout: LayoutFile | null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Returns the `#s=...` fragment (including the leading `#`) and its
 * total serialized length, so the caller can enforce
 * `SHARE_URL_SIZE_LIMIT` before using it. */
export function encodeShareState(state: ShareState): { fragment: string; size: number } {
  const json = JSON.stringify(state);
  const compressed = zlibSync(strToU8(json), { level: 9 });
  const encoded = bytesToBase64Url(compressed);
  const fragment = `#${FRAGMENT_KEY}=${encoded}`;
  return { fragment, size: fragment.length };
}

/** Decodes a `location.hash`-style fragment (with or without the leading
 * `#`) back into a ShareState, or `null` if it isn't a share fragment /
 * fails to decode. */
export function decodeShareState(hash: string): ShareState | null {
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  const prefix = `${FRAGMENT_KEY}=`;
  if (!trimmed.startsWith(prefix)) return null;
  try {
    const bytes = base64UrlToBytes(trimmed.slice(prefix.length));
    const json = strFromU8(unzlibSync(bytes));
    return JSON.parse(json) as ShareState;
  } catch {
    return null;
  }
}
