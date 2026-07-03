import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decodeShareState, encodeShareState, SHARE_URL_SIZE_LIMIT } from './shareLink';

const authSystemYAML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml'),
  'utf8',
);

describe('shareLink', () => {
  it('round-trips yaml + layout through encode/decode', () => {
    const { fragment } = encodeShareState({
      fileName: 'auth-system.dc.yaml',
      yaml: authSystemYAML,
      layout: { views: { default: { positions: { Gateway: { x: 42, y: 7 } } } } },
    });
    const decoded = decodeShareState(fragment);
    expect(decoded?.yaml).toBe(authSystemYAML);
    expect(decoded?.layout?.views.default?.positions.Gateway).toEqual({ x: 42, y: 7 });
    expect(decoded?.fileName).toBe('auth-system.dc.yaml');
  });

  it('returns null for a fragment that is not a share link', () => {
    expect(decodeShareState('#not-a-share-link')).toBeNull();
    expect(decodeShareState('')).toBeNull();
  });

  it('auth-system.dc.yaml encodes to well under the URL size limit', () => {
    const { size } = encodeShareState({ fileName: 'auth-system.dc.yaml', yaml: authSystemYAML, layout: null });
    expect(size).toBeLessThanOrEqual(SHARE_URL_SIZE_LIMIT);
  });
});
