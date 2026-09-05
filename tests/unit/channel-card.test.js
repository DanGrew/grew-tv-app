import {
  CARD_SECONDS, TIMED_LINES, LATER_LINES, CARD_LOOKAHEAD,
  NEXT_CARD, OFF_AIR_CARD, LATER_SEPARATOR, BETWEEN,
  timedLines, laterTitles, laterText, cardKind, cardView, cardStatus
} from '../../core/channel-card.js';

// FEAT-560/TASK-565 — the card in the gap, and the same card holding an off-air
// channel. One component, two callers (decision 8), so the thing worth proving
// is that both come out of one function and neither grew a state of its own.
//
// The behaviour that reads like a formatting detail and isn't: three lines carry
// clock times and the later list carries none. A time invites waiting for
// something; an untimed list only says come back later. Tests below assert the
// asymmetry in both directions, because it is the sort of thing a later hand
// "tidies up" by giving every line a time.

function entry(id, title, startsAt) {
  return {
    item: { item_id: id, title: title },
    tag: 'preschool', starts_at: startsAt, ends_at: '2026-09-04T18:00:00'
  };
}

const NEXT = [
  entry('duggee-s1e04', 'Hey Duggee',          '2026-09-04T17:08:00'),
  entry('bluey-s1e12',  'Bob Bilby',           '2026-09-04T17:15:00'),
  entry('bluey-s1e21',  'Neighbours',          '2026-09-04T17:22:00'),
  entry('bluey-s1e01',  'The Magic Xylophone', '2026-09-04T17:29:00'),
  entry('bluey-s1e03',  'Keepy Uppy',          '2026-09-04T17:36:00'),
  entry('bluey-s1e04',  'Daddy Robot',         '2026-09-04T17:43:00'),
  entry('bluey-s1e05',  'Shadowlands',         '2026-09-04T17:50:00')
];

function detail(over) {
  return Object.assign({
    channel_id: 'cartoon-club', name: 'Cartoon Club', item_type: 'episode',
    on_air: true,
    item: { item_id: 'bluey-s1e22', title: 'Hammerbarn' },
    offset_seconds: 120, runtime_seconds: 480, next_on_air: null,
    bed: 'ootb', next: NEXT
  }, over || {});
}

function offAir(over) {
  return Object.assign(detail(), {
    on_air: false, item: null, offset_seconds: null, runtime_seconds: null,
    next_on_air: '2026-09-04T21:00:00', next: []
  }, over || {});
}

describe('the numbers the card is drawn to', () => {
  it('holds the card for five to ten seconds', () => {
    // Decision 12's window. Long enough to read three lines at TV distance,
    // short enough that the next programme has barely started behind it.
    expect(CARD_SECONDS).toBe(8);
    expect(CARD_SECONDS).toBeGreaterThanOrEqual(5);
    expect(CARD_SECONDS).toBeLessThanOrEqual(10);
  });

  it('draws THREE timed lines, not four', () => {
    // Four was a desktop assumption and is too many at TV viewing distance.
    expect(TIMED_LINES).toBe(3);
  });

  it('keeps the later list shorter than nothing else on the card', () => {
    expect(LATER_LINES).toBe(4);
  });

  it('asks for both halves in one request, inside the endpoint cap', () => {
    // api/channels.py clamps at MAX_LOOKAHEAD 10 — asking for more would be
    // silently trimmed, and asking twice would be two answers for one card.
    expect(CARD_LOOKAHEAD).toBe(TIMED_LINES + LATER_LINES);
    expect(CARD_LOOKAHEAD).toBe(7);
    expect(CARD_LOOKAHEAD).toBeLessThanOrEqual(10);
  });
});

describe('timedLines', () => {
  it('names the next three with their clock times', () => {
    expect(timedLines(detail())).toEqual([
      { time: '17:08', title: 'Hey Duggee' },
      { time: '17:15', title: 'Bob Bilby' },
      { time: '17:22', title: 'Neighbours' }
    ]);
  });

  it('stops at three however long the lookahead is', () => {
    expect(timedLines(detail()).length).toBe(3);
  });

  it('reads the clock off the stamp WHOLE, never through a Date', () => {
    // The programme promises 15:30 means 15:30 (grammar call 3 — DST is not
    // modelled and the backend stamps no zone). Parsing to a Date and
    // formatting back is the one way to turn that into an hour's drift, so a
    // stamp that only LOOKS like it carries a clock is no time at all.
    expect(timedLines(detail({ next: [entry('a', 'A', '17:08')] }))).toEqual([]);
    expect(timedLines(detail({ next: [entry('a', 'A', 1757000000)] }))).toEqual([]);
    expect(timedLines(detail({ next: [entry('a', 'A', null)] }))).toEqual([]);
  });

  it('shortens the card rather than drawing a line with a blank time', () => {
    const mixed = detail({ next: [entry('a', 'A', null), NEXT[0], NEXT[1]] });
    expect(timedLines(mixed)).toEqual([
      { time: '17:08', title: 'Hey Duggee' },
      { time: '17:15', title: 'Bob Bilby' }
    ]);
  });

  it('names an id the catalog has forgotten rather than blanking the line', () => {
    // A six-month programme outlives the library under it, so a removed item
    // should read as a gap, not a blank row.
    const gone = detail({ next: [{ item: { item_id: 'gone-s1e01' }, starts_at: '2026-09-04T17:08:00' }] });
    expect(timedLines(gone)).toEqual([{ time: '17:08', title: 'gone-s1e01' }]);
  });

  it('survives an answer with no lookahead at all', () => {
    expect(timedLines(detail({ next: [] }))).toEqual([]);
    expect(timedLines(detail({ next: null }))).toEqual([]);
    expect(timedLines(detail({ next: [null, undefined] }))).toEqual([]);
    expect(timedLines({})).toEqual([]);
    expect(timedLines(null)).toEqual([]);
  });
});

describe('laterTitles', () => {
  it('is the names AFTER the timed lines, untimed', () => {
    expect(laterTitles(detail())).toEqual([
      'The Magic Xylophone', 'Keepy Uppy', 'Daddy Robot', 'Shadowlands'
    ]);
  });

  it('carries no times — the asymmetry IS the design', () => {
    // Every entry it draws from has a `starts_at`; none of it reaches the card.
    laterTitles(detail()).forEach(title => expect(typeof title).toBe('string'));
    expect(laterTitles(detail()).join(' ')).not.toContain(':');
  });

  it('caps, so the card cannot grow down the screen', () => {
    const long = detail({ next: NEXT.concat(NEXT) });
    expect(laterTitles(long).length).toBe(LATER_LINES);
  });

  it('is everything the timed half did NOT take, skipped entries included', () => {
    // An entry the timed half passed over for want of a clock is still
    // something that is on later — and counting off the front of the list
    // instead would both lose it AND repeat a line already drawn with a time.
    const mixed = detail({ next: [entry('a', 'Unclocked', null), NEXT[0], NEXT[1], NEXT[2], NEXT[3]] });
    expect(timedLines(mixed).map(l => l.title)).toEqual(['Hey Duggee', 'Bob Bilby', 'Neighbours']);
    expect(laterTitles(mixed)).toEqual(['Unclocked', 'The Magic Xylophone']);
  });

  it('never repeats a line the timed half already drew', () => {
    const view = detail();
    const timed = timedLines(view).map(l => l.title);
    laterTitles(view).forEach(title => expect(timed).not.toContain(title));
  });

  it('is empty when the lookahead does not reach past the timed lines', () => {
    expect(laterTitles(detail({ next: NEXT.slice(0, 3) }))).toEqual([]);
    expect(laterTitles(detail({ next: [] }))).toEqual([]);
    expect(laterTitles(null)).toEqual([]);
  });

  it('drops an entry it cannot name at all rather than listing a blank', () => {
    const nameless = detail({ next: NEXT.slice(0, 3).concat([{ item: null, starts_at: '2026-09-04T17:29:00' }, NEXT[4]]) });
    expect(laterTitles(nameless)).toEqual(['Keepy Uppy']);
  });
});

describe('laterText', () => {
  it('runs the names together as one glance', () => {
    expect(laterText(['Keepy Uppy', 'Daddy Robot'])).toBe('Keepy Uppy · Daddy Robot');
    expect(LATER_SEPARATOR).toBe(' · ');
  });

  it('is one name on its own, with no trailing separator', () => {
    expect(laterText(['Keepy Uppy'])).toBe('Keepy Uppy');
  });

  it('is empty with nothing later', () => {
    expect(laterText([])).toBe('');
    expect(laterText(null)).toBe('');
  });
});

describe('cardKind', () => {
  it('is the gap between items while the channel is on air', () => {
    expect(cardKind(detail())).toBe(NEXT_CARD);
    expect(NEXT_CARD).toBe('next');
  });

  it('is the holding card whenever the channel is not', () => {
    expect(cardKind(offAir())).toBe(OFF_AIR_CARD);
    expect(cardKind({})).toBe(OFF_AIR_CARD);
    expect(cardKind(null)).toBe(OFF_AIR_CARD);
    expect(OFF_AIR_CARD).toBe('off-air');
  });
});

describe('cardView — between items', () => {
  it('names the channel, the three timed lines and the later list', () => {
    expect(cardView(detail())).toEqual({
      kind: NEXT_CARD,
      label: 'Cartoon Club',
      headline: null,
      returnAt: null,
      timed: [
        { time: '17:08', title: 'Hey Duggee' },
        { time: '17:15', title: 'Bob Bilby' },
        { time: '17:22', title: 'Neighbours' }
      ],
      later: ['The Magic Xylophone', 'Keepy Uppy', 'Daddy Robot', 'Shadowlands']
    });
  });

  it('says nothing about being off air, because it is not', () => {
    const view = cardView(detail());
    expect(view.headline).toBe(null);
    expect(view.returnAt).toBe(null);
  });

  it('names the channel by its id when its config forgot to name it', () => {
    expect(cardView(detail({ name: null })).label).toBe('cartoon-club');
    expect(cardView(detail({ name: '' })).label).toBe('cartoon-club');
  });

  it('is empty rather than undefined with nothing to name it by', () => {
    expect(cardView({ on_air: true }).label).toBe('');
  });

  it('still draws with no lookahead behind it — a card with nothing to list', () => {
    const bare = cardView(detail({ next: [] }));
    expect(bare.kind).toBe(NEXT_CARD);
    expect(bare.timed).toEqual([]);
    expect(bare.later).toEqual([]);
  });
});

describe('cardView — off air', () => {
  it('says off air and when the channel is back', () => {
    expect(cardView(offAir())).toEqual({
      kind: OFF_AIR_CARD,
      label: 'Cartoon Club',
      headline: 'Off air',
      returnAt: 'Back at 21:00',
      timed: [],
      later: []
    });
  });

  it('names nothing when the answer carries no return time', () => {
    // ⚠️ The time comes from the ENDPOINT, never the slot config (owner,
    // 2026-09-03): a slot whose tag pool was empty at generation airs nothing,
    // so the config would promise a return the channel never makes. No time is
    // the same card, one line shorter.
    const plain = cardView(offAir({ next_on_air: null }));
    expect(plain.headline).toBe('Off air');
    expect(plain.returnAt).toBe(null);
  });

  it('is ONE card for all three off-air causes, never a fourth', () => {
    // Between slots with nothing left, never regenerated, and run out of
    // programme all answer identically on the wire — so they draw identically.
    const between = cardView(offAir({ next_on_air: '2026-09-04T21:00:00' }));
    const never = cardView(offAir({ next_on_air: null }));
    const expired = cardView(offAir({ next_on_air: null, next: [] }));
    expect(never).toEqual(expired);
    expect(between.kind).toBe(never.kind);
  });

  it('lists nothing even when the answer still carries a lookahead', () => {
    // A channel that is not on air has nothing coming that the viewer can wait
    // up for, so the timed lines would be a promise the card cannot keep.
    const odd = cardView(offAir({ next: NEXT }));
    expect(odd.timed).toEqual([]);
    expect(odd.later).toEqual([]);
  });
});

describe('cardStatus — what the phone is told', () => {
  it('says the TV is between programmes, and what is next', () => {
    expect(cardStatus(detail())).toEqual({
      label: BETWEEN, line: 'Next: Hey Duggee at 17:08'
    });
    expect(BETWEEN).toBe('Between programmes');
  });

  it('reads the FIRST timed line, not a later one', () => {
    expect(cardStatus(detail()).line).toContain('Hey Duggee');
    expect(cardStatus(detail()).line).not.toContain('Bob Bilby');
  });

  it('says off air and when it is back', () => {
    expect(cardStatus(offAir())).toEqual({ label: 'Off air', line: 'Back at 21:00' });
  });

  it('says off air and nothing else when there is no time to name', () => {
    expect(cardStatus(offAir({ next_on_air: null }))).toEqual({ label: 'Off air', line: '' });
  });

  it('never leaves the phone on a stale line when there is nothing to say', () => {
    // The whole point of the push: the phone must not sit on the title of the
    // programme that just finished. A label is always present.
    expect(cardStatus(detail({ next: [] }))).toEqual({ label: BETWEEN, line: '' });
    expect(cardStatus({}).label).toBe('Off air');
    expect(cardStatus(null).label).toBe('Off air');
  });
});
