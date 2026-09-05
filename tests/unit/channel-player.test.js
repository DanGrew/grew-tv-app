import {
  LIVE_TOLERANCE_SECONDS,
  isBehindLive, entryFinished, shouldRetune, upNextTitle,
  channelRecord, identLabel, flipTarget, channelIds
} from '../../core/channel-player.js';

// FEAT-560/TASK-564 — the channel PLAYER's model. The chrome above it is a thin
// mapping of what's here: where the channel is versus where the viewer is, when
// the player asks what's on again, and which channel the rocker lands on.
//
// The behaviour worth proving is the one that is hardest to see by watching:
// restarting an item leaves the viewer behind ON PURPOSE, and the channel
// finishing that item must NOT drag them off it (story 5).

function detail(over) {
  return Object.assign({
    channel_id: 'cartoon-club', name: 'Cartoon Club', item_type: 'episode',
    on_air: true,
    item: { item_id: 'bluey-s1e22', title: 'Bluey', ext: 'mp4', subtitles: 'bluey-s1e22.vtt' },
    offset_seconds: 120, runtime_seconds: 480, next_on_air: null,
    bed: null, tag: 'preschool',
    started_at: '2026-09-04T17:00:00', ends_at: '2026-09-04T17:08:00',
    next: [{ item: { item_id: 'duggee-s1e04', title: 'Hey Duggee' }, tag: 'preschool',
             starts_at: '2026-09-04T17:08:00', ends_at: '2026-09-04T17:15:00' }]
  }, over || {});
}

function offAir(over) {
  return Object.assign(detail(), {
    on_air: false, item: null, offset_seconds: null, runtime_seconds: null,
    started_at: null, ends_at: null, next: []
  }, over || {});
}

describe('isBehindLive', () => {
  it('is false while the viewer is level with the channel', () => {
    expect(isBehindLive(120, 120)).toBe(false);
  });

  it('tolerates the seek-and-buffer noise a tune-in lands with', () => {
    // Exactly at the tolerance is still level — the pill appears only once the
    // viewer has genuinely missed something.
    expect(isBehindLive(120, 120 + LIVE_TOLERANCE_SECONDS)).toBe(false);
    expect(isBehindLive(120, 121)).toBe(false);
  });

  it('is true once the gap passes the tolerance', () => {
    expect(isBehindLive(120, 120 + LIVE_TOLERANCE_SECONDS + 0.5)).toBe(true);
    // A restart is the big case: the whole way back to the start of the item.
    expect(isBehindLive(0, 300)).toBe(true);
  });

  it('is false for a viewer AHEAD of the channel', () => {
    // Can't happen by tuning in, but a forward Jump can put the playhead past
    // the live edge — and "back to live" would then be a rewind, which the pill
    // does not claim to be.
    expect(isBehindLive(300, 120)).toBe(false);
  });

  it('is false with nothing on air, so a dead channel offers no way back', () => {
    expect(isBehindLive(0, null)).toBe(false);
    expect(isBehindLive(0, undefined)).toBe(false);
  });

  it('holds the tolerance at five seconds', () => {
    expect(LIVE_TOLERANCE_SECONDS).toBe(5);
  });
});

describe('entryFinished', () => {
  it('is false while the channel is still inside the entry', () => {
    expect(entryFinished(detail(), 0)).toBe(false);
    expect(entryFinished(detail(), 359)).toBe(false);
  });

  it('is true the moment the ENTRY runs out', () => {
    // 120s in, 480s long — 360s of elapsed real time and the channel is done
    // with it, whatever the viewer is doing.
    expect(entryFinished(detail(), 360)).toBe(true);
    expect(entryFinished(detail(), 900)).toBe(true);
  });

  it('reads the ENTRY runtime, not the file duration', () => {
    // An item cut short by an off-air stretch airs less than it runs. The
    // channel rolls on at the SHORTER of the two, or the player sits on a
    // truncated item long after the programme moved.
    expect(entryFinished(detail({ runtime_seconds: 200 }), 80)).toBe(true);
    expect(entryFinished(detail({ runtime_seconds: 200 }), 79)).toBe(false);
  });

  it('is false when there is no usable runtime, rather than throwing', () => {
    expect(entryFinished(offAir(), 9999)).toBe(false);
    expect(entryFinished(detail({ runtime_seconds: 0 }), 9999)).toBe(false);
    expect(entryFinished(detail({ runtime_seconds: -5 }), 9999)).toBe(false);
    expect(entryFinished(detail({ runtime_seconds: 'soon' }), 9999)).toBe(false);
    expect(entryFinished(null, 9999)).toBe(false);
    expect(entryFinished(undefined, 9999)).toBe(false);
  });
});

describe('shouldRetune', () => {
  it('rejoins a viewer who is level once the entry ends', () => {
    expect(shouldRetune(detail(), 360, false)).toBe(true);
  });

  it('LEAVES A RESTARTED VIEWER ALONE when the entry ends', () => {
    // Decision 11, story 5 — the channel carries on without them and they
    // finish what they restarted. Rejoining here is exactly the "queue that
    // waits" behaviour a channel is not.
    expect(shouldRetune(detail(), 360, true)).toBe(false);
    expect(shouldRetune(detail(), 9999, true)).toBe(false);
  });

  it('never rejoins before the entry is over', () => {
    expect(shouldRetune(detail(), 0, false)).toBe(false);
    expect(shouldRetune(detail(), 359, false)).toBe(false);
  });
});

describe('upNextTitle', () => {
  it('names what the SCHEDULE plays next', () => {
    expect(upNextTitle(detail())).toBe('Hey Duggee');
  });

  it('reads the FIRST lookahead entry, not a later one', () => {
    const two = detail({ next: [
      { item: { item_id: 'a', title: 'First' } },
      { item: { item_id: 'b', title: 'Second' } }
    ] });
    expect(upNextTitle(two)).toBe('First');
  });

  it('names an id the catalog has forgotten rather than blanking the line', () => {
    expect(upNextTitle(detail({ next: [{ item: { item_id: 'gone-s1e01' } }] }))).toBe('gone-s1e01');
  });

  it('is null when the answer carries no lookahead at all', () => {
    expect(upNextTitle(detail({ next: [] }))).toBe(null);
    expect(upNextTitle(detail({ next: null }))).toBe(null);
    expect(upNextTitle(offAir())).toBe(null);
    expect(upNextTitle(null)).toBe(null);
  });

  it('is null when the next entry resolves to nothing nameable', () => {
    expect(upNextTitle(detail({ next: [{ item: null }] }))).toBe(null);
    expect(upNextTitle(detail({ next: [{ item: { item_id: '' } }] }))).toBe(null);
  });
});

describe('channelRecord', () => {
  it('carries the four fields the player loads an item with', () => {
    expect(channelRecord(detail())).toEqual({
      id: 'bluey-s1e22', title: 'Bluey', subtitles: 'bluey-s1e22.vtt', ext: 'mp4'
    });
  });

  it('reads `item_id` as the record id — the field the endpoint actually sends', () => {
    expect(channelRecord(detail()).id).toBe('bluey-s1e22');
  });

  it('is null off air, which is the one answer all three off-air states give', () => {
    expect(channelRecord(offAir())).toBe(null);
    expect(channelRecord({})).toBe(null);
    expect(channelRecord(null)).toBe(null);
  });

  it('still builds a record for an item the catalog no longer knows', () => {
    // api/channels.py resolves an unknown id to a minimal entry on purpose; the
    // play will fail at the media URL, which is honest, rather than the player
    // deciding there is nothing on when the channel says there is.
    expect(channelRecord(detail({ item: { item_id: 'gone' } })))
      .toEqual({ id: 'gone', title: undefined, subtitles: undefined, ext: undefined });
  });
});

describe('identLabel', () => {
  it('reads the channel name', () => {
    expect(identLabel(detail())).toBe('Cartoon Club');
  });

  it('falls back to the id so an unnamed channel is still identifiable', () => {
    expect(identLabel(detail({ name: null }))).toBe('cartoon-club');
    expect(identLabel(detail({ name: '' }))).toBe('cartoon-club');
  });

  it('is empty rather than undefined with nothing to go on', () => {
    expect(identLabel({})).toBe('');
    expect(identLabel(null)).toBe('');
  });
});

describe('flipTarget', () => {
  const ids = ['cartoon-club', 'after-dark', 'matinee'];

  it('steps up and down the strip in its own order', () => {
    expect(flipTarget(ids, 'cartoon-club', 1)).toBe('after-dark');
    expect(flipTarget(ids, 'after-dark', 1)).toBe('matinee');
    expect(flipTarget(ids, 'after-dark', -1)).toBe('cartoon-club');
  });

  it('wraps at both ends, so the same press always moves', () => {
    expect(flipTarget(ids, 'matinee', 1)).toBe('cartoon-club');
    expect(flipTarget(ids, 'cartoon-club', -1)).toBe('matinee');
  });

  it('stays put on a strip of one', () => {
    expect(flipTarget(['only'], 'only', 1)).toBe('only');
    expect(flipTarget(['only'], 'only', -1)).toBe('only');
  });

  it('lands on the first when the current channel is no longer on the strip', () => {
    // The programme moved under this page. Refusing to flip would trap the
    // viewer on a channel whose neighbours they can no longer reach.
    expect(flipTarget(ids, 'retired', 1)).toBe('cartoon-club');
    expect(flipTarget(ids, 'retired', -1)).toBe('cartoon-club');
  });

  it('is null with no strip to flip through', () => {
    expect(flipTarget([], 'cartoon-club', 1)).toBe(null);
    expect(flipTarget(null, 'cartoon-club', 1)).toBe(null);
  });
});

describe('channelIds', () => {
  it('keeps the order the endpoint served', () => {
    expect(channelIds([{ channel_id: 'b' }, { channel_id: 'a' }])).toEqual(['b', 'a']);
  });

  it('is empty with no strip', () => {
    expect(channelIds([])).toEqual([]);
    expect(channelIds(null)).toEqual([]);
  });
});
