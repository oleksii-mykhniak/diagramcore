import { describe, expect, it } from 'vitest';
import {
  AUTOSAVE_DEBOUNCE_MS,
  cancelScheduledAutosave,
  clearAutosave,
  loadAutosave,
  saveAutosave,
  scheduleAutosave,
} from './localAutosave';
import type { AutosaveData } from './localAutosave';

const data: AutosaveData = {
  rawText: 'diagram:\n  title: "T"\nnodes: []\nlinks: []\n',
  positions: { A: { x: 1, y: 2 } },
  notePositions: {},
  renderStyle: 'clean',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('localAutosave', () => {
  it('round-trips a save/load/clear cycle', async () => {
    await saveAutosave('a.dc.yaml', data);
    const loaded = await loadAutosave('a.dc.yaml');
    expect(loaded?.rawText).toBe(data.rawText);
    expect(loaded?.positions).toEqual(data.positions);
    expect(loaded?.savedAt).toBeGreaterThan(0);

    await clearAutosave('a.dc.yaml');
    expect(await loadAutosave('a.dc.yaml')).toBeNull();
  });

  it('scheduleAutosave debounces to a single write ~1s after the last mutation', async () => {
    scheduleAutosave('b.dc.yaml', data);
    await sleep(AUTOSAVE_DEBOUNCE_MS / 2);
    scheduleAutosave('b.dc.yaml', { ...data, rawText: data.rawText + '# edit 1\n' });
    await sleep(AUTOSAVE_DEBOUNCE_MS / 2);
    scheduleAutosave('b.dc.yaml', { ...data, rawText: data.rawText + '# edit 2\n' });

    // Not yet written — the last edit reset the debounce window.
    await sleep(AUTOSAVE_DEBOUNCE_MS / 2);
    expect(await loadAutosave('b.dc.yaml')).toBeNull();

    await sleep(AUTOSAVE_DEBOUNCE_MS);
    const loaded = await loadAutosave('b.dc.yaml');
    expect(loaded?.rawText).toBe(data.rawText + '# edit 2\n');
  }, 10000);

  it('cancelScheduledAutosave prevents the pending write', async () => {
    scheduleAutosave('c.dc.yaml', data);
    cancelScheduledAutosave('c.dc.yaml');
    await sleep(AUTOSAVE_DEBOUNCE_MS + 200);
    expect(await loadAutosave('c.dc.yaml')).toBeNull();
  }, 10000);
});
