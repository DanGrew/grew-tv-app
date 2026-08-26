import { describe, it, expect } from 'vitest';
import { nowPlaying, isSwap, isStaleResync, upNextItem, upNextLine, sourceId, sourceKey } from '../../core/queue-playback-router.js';

function item(id, title) { return { item_id: id, title: title }; }
function snap(fields) {
  return Object.assign({ now_playing: null, queue: [], next: [], coming_up: [] }, fields);
}

describe('nowPlaying', () => {
  it('is the snapshot\'s now_playing', () => {
    expect(nowPlaying(snap({ now_playing: item('a', 'A') })).item_id).toBe('a');
  });
  it('is null for an empty/absent snapshot', () => {
    expect(nowPlaying(snap({}))).toBe(null);
    expect(nowPlaying(null)).toBe(null);
  });
});

describe('isSwap', () => {
  it('is true when now_playing differs from the loaded id', () => {
    expect(isSwap('a', snap({ now_playing: item('b', 'B') }))).toBe(true);
  });
  it('is false when now_playing matches the loaded id — no re-swap of the same item', () => {
    expect(isSwap('a', snap({ now_playing: item('a', 'A') }))).toBe(false);
  });
  it('is false when there is no now_playing', () => {
    expect(isSwap('a', snap({}))).toBe(false);
    expect(isSwap(null, snap({}))).toBe(false);
  });
});

// BUG-521 — the entry-time recovery GET is a fallback, never an override.
describe('isStaleResync', () => {
  it('is stale once something is loaded — a push landed, so there is nothing to recover', () => {
    expect(isStaleResync('a', 'a', snap({ now_playing: item('a', 'A') }))).toBe(true);
    expect(isStaleResync('a', 'b', snap({ now_playing: item('b', 'B') }))).toBe(true);
  });
  it('is stale when nothing is loaded but the answer names another item — it predates our POST', () => {
    expect(isStaleResync('a', null, snap({ now_playing: item('b', 'B') }))).toBe(true);
  });
  it('is fresh when nothing is loaded and the answer names the pending pick', () => {
    expect(isStaleResync('a', null, snap({ now_playing: item('a', 'A') }))).toBe(false);
  });
  it('is fresh with no pending pick — Play All / ?playQueue let the engine choose', () => {
    expect(isStaleResync(null, null, snap({ now_playing: item('b', 'B') }))).toBe(false);
  });
  it('is fresh when there is no now_playing — queue and transport state still apply', () => {
    expect(isStaleResync('a', null, snap({}))).toBe(false);
    expect(isStaleResync(null, null, snap({}))).toBe(false);
  });
});

describe('upNextItem', () => {
  it('prefers the front of queue (an explicit queue pick) over next', () => {
    expect(upNextItem(snap({ queue: [item('q', 'Q')], next: [item('n', 'N')] })).item_id).toBe('q');
  });
  it('falls back to the front of next when queue is empty', () => {
    expect(upNextItem(snap({ next: [item('n', 'N')], coming_up: [item('c', 'C')] })).item_id).toBe('n');
  });
  it('falls back to the front of coming_up (the repeat-wrap preview) when both are empty', () => {
    expect(upNextItem(snap({ coming_up: [item('c', 'C')] })).item_id).toBe('c');
  });
  it('is null when all three are empty — nothing plays after this', () => {
    expect(upNextItem(snap({}))).toBe(null);
    expect(upNextItem(null)).toBe(null);
  });
});

describe('upNextLine', () => {
  it('is "Up next: <title>" for the resolved up-next item', () => {
    expect(upNextLine(snap({ next: [item('n', 'Next Clip')] }))).toEqual({ prefix: 'Up next: ', label: 'Next Clip' });
  });
  it('is "Up next: <title>" for a queued pick, even at the end of the source (queue wins over the wrap label)', () => {
    expect(upNextLine(snap({ queue: [item('q', 'Queued Clip')] }))).toEqual({ prefix: 'Up next: ', label: 'Queued Clip' });
  });
  // TASK-503 — films keep this wording moving onto the unified engine: queue
  // and next both empty means the only candidate left is the repeat-wrap
  // preview (coming_up), so this is the "Start again" case, not a plain
  // "Up next" line.
  it('is "Start again" when queue and next are both empty and coming_up holds the repeat wrap', () => {
    expect(upNextLine(snap({ coming_up: [item('c', 'First Clip')] }))).toEqual({ prefix: '', label: 'Start again' });
  });
  it('is still "Start again" when queue/next are genuinely absent from the snapshot, not just empty', () => {
    expect(upNextLine({ coming_up: [item('c', 'First Clip')] })).toEqual({ prefix: '', label: 'Start again' });
  });
  it('is null when there is no up-next item', () => {
    expect(upNextLine(snap({}))).toBe(null);
  });
});

// TASK-501 removed queueCount along with browse's 🎬/🎵 pills — the Continue
// buttons that replace them show no count.

describe('sourceId', () => {
  it('is the snapshot\'s source_id when a source_type is set', () => {
    expect(sourceId(snap({ source_type: 'series', source_id: 'bluey' }))).toBe('bluey');
  });
  it('is null when there is no source_type (a standalone film has none)', () => {
    expect(sourceId(snap({ source_type: null, source_id: 'stray' }))).toBe(null);
  });
  it('is null for an empty/absent snapshot', () => {
    expect(sourceId(snap({}))).toBe(null);
    expect(sourceId(null)).toBe(null);
  });
});

// TASK-505 — the identity a caller caches its fetched source NAME against.
describe('sourceKey', () => {
  it('joins the source type and id, so two sources never collide', () => {
    expect(sourceKey(snap({ source_type: 'series', source_id: 'bluey' }))).toBe('series/bluey');
    expect(sourceKey(snap({ source_type: 'mv-artist', source_id: 'QOTSA' }))).toBe('mv-artist/QOTSA');
  });
  // The whole point of keying on the type as well: Play All IS a source, and
  // an id-only key would read it as having none.
  it('keys a whole-catalog source that carries no id, rather than reading as source-less', () => {
    expect(sourceKey(snap({ source_type: 'mv-all', source_id: null }))).toBe('mv-all/null');
    expect(sourceKey(snap({ source_type: 'home-movies-all', source_id: null }))).toBe('home-movies-all/null');
  });
  it('tells two source TYPES apart even when their ids match', () => {
    expect(sourceKey(snap({ source_type: 'mv-playlist', source_id: 'pl-1' })))
      .not.toBe(sourceKey(snap({ source_type: 'playlist', source_id: 'pl-1' })));
  });
  it('is null when there is no source at all (a standalone item)', () => {
    expect(sourceKey(snap({ source_type: null, source_id: 'stray' }))).toBe(null);
    expect(sourceKey(snap({}))).toBe(null);
    expect(sourceKey(null)).toBe(null);
  });
});
