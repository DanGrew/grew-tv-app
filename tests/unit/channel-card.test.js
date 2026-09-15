import {
  CARD_SECONDS, TIMED_LINES, LATER_LINES, CARD_LOOKAHEAD,
  NEXT_CARD, OFF_AIR_CARD, LATER_SEPARATOR, BETWEEN,
  timedLines, laterTitles, laterText, cardKind, cardView, cardStatus, holdSeconds
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

// TASK-592 — an entry's item carries the SHOW it belongs to (`series`, put on the
// wire by TASK-588), or null for anything the catalog holds no show for: a film,
// a track, a home movie, and an episode belonging to nothing. The card reads that
// block through channels.js, so a fixture without it is a fixture of films.
function entry(id, title, startsAt, series) {
  return {
    item: { item_id: id, title: title, series: series || null },
    group: 'preschool', starts_at: startsAt, ends_at: '2026-09-04T18:00:00'
  };
}

function bluey(episode) {
  return { id: 'series-bluey', title: 'Bluey', season: 1, episode: episode };
}
const DUGGEE = { id: 'series-hey-duggee', title: 'Hey Duggee', season: 1, episode: 4 };

// Cartoon Club as it actually airs: one Hey Duggee, then a run of Bluey. The
// lookahead spanning two shows is the point — it is what makes the timed half's
// job (tell three programmes apart) and the later half's job (say what is on
// afterwards) visibly different.
const NEXT = [
  entry('duggee-s1e04', 'The Tidying Up Badge', '2026-09-04T17:08:00', DUGGEE),
  entry('bluey-s1e12',  'Bob Bilby',           '2026-09-04T17:15:00', bluey(12)),
  entry('bluey-s1e21',  'Neighbours',          '2026-09-04T17:22:00', bluey(21)),
  entry('bluey-s1e01',  'The Magic Xylophone', '2026-09-04T17:29:00', bluey(1)),
  entry('bluey-s1e03',  'Keepy Uppy',          '2026-09-04T17:36:00', bluey(3)),
  entry('bluey-s1e04',  'Daddy Robot',         '2026-09-04T17:43:00', bluey(4)),
  entry('bluey-s1e05',  'Shadowlands',         '2026-09-04T17:50:00', bluey(5))
];

// ⚠️ THE CASE THIS ROW EXISTS FOR (TASK-592). TASK-585 makes a show hold a slot
// and run episode-in-order, so consecutive entries sharing a show is the NORMAL
// line-up, not an edge — five Bluey episodes, then Hey Duggee takes over.
const REPEAT_RUN = [
  entry('bluey-s1e12',  'Bob Bilby',           '2026-09-04T17:08:00', bluey(12)),
  entry('bluey-s1e21',  'Neighbours',          '2026-09-04T17:15:00', bluey(21)),
  entry('bluey-s1e01',  'The Magic Xylophone', '2026-09-04T17:22:00', bluey(1)),
  entry('bluey-s1e03',  'Keepy Uppy',          '2026-09-04T17:29:00', bluey(3)),
  entry('bluey-s1e04',  'Daddy Robot',         '2026-09-04T17:36:00', bluey(4)),
  entry('duggee-s1e04', 'The Tidying Up Badge', '2026-09-04T17:43:00', DUGGEE),
  entry('duggee-s1e09', 'The Bug Badge',       '2026-09-04T17:50:00', { id: 'series-hey-duggee', title: 'Hey Duggee', season: 1, episode: 9 })
];

// After Dark: two films back to back, and a film belongs to no show. Nothing on
// this card has a second line to draw, and none ever did — story 4 is that this
// line-up is untouched by the whole row.
const FILMS = [
  entry('alien',    'Alien',        '2026-09-04T21:00:00'),
  entry('the-thing', 'The Thing',   '2026-09-04T23:00:00'),
  entry('predator', 'Predator',     '2026-09-05T01:00:00'),
  entry('robocop',  'RoboCop',      '2026-09-05T03:00:00')
];

function detail(over) {
  return Object.assign({
    channel_id: 'cartoon-club', name: 'Cartoon Club', item_type: 'episode',
    on_air: true,
    item: { item_id: 'bluey-s1e22', title: 'Hammerbarn' },
    offset_seconds: 120, runtime_seconds: 480, next_on_air: null,
    next: NEXT
  }, over || {});
}

function offAir(over) {
  return Object.assign(detail(), {
    on_air: false, item: null, offset_seconds: null, runtime_seconds: null,
    next_on_air: '2026-09-04T21:00:00', next: []
  }, over || {});
}

describe('the numbers the card is drawn to', () => {
  it('floors the hold at five to ten seconds', () => {
    // Decision 12's window. Long enough to read three lines at TV distance,
    // short enough that the next programme has barely started behind it. It is
    // the FLOOR under the hold, not the whole of it — see holdSeconds below.
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

// TASK-574 — how long the card holds. The floor and the schedule are ONE rule
// answering two situations, and the tests below are the two situations: an item
// that ended on schedule has nothing to wait for, and one that ended early
// leaves the channel still airing it.
describe('holdSeconds', () => {
  it('holds only the floor when the channel has already rolled on', () => {
    // The slot is 480s and the channel has reached 480 — the next programme is
    // airing behind the card, so waiting for it would be waiting for nothing.
    expect(holdSeconds(detail({ offset_seconds: 480 }), 0)).toBe(CARD_SECONDS);
  });

  it('holds the rest of the slot when the item ended early', () => {
    // 120s into an eight-minute slot: the channel has SIX MINUTES of it still to
    // air, and clearing the card before then drops the viewer back into the
    // middle of the item that just ended — the whole of story 1.
    expect(holdSeconds(detail(), 0)).toBe(360);
  });

  it('counts the seconds since the answer was served, not just the offset', () => {
    // The answer is only true at the moment it arrived. Two minutes later the
    // channel is two minutes further into the slot, so the hold is shorter.
    expect(holdSeconds(detail(), 120)).toBe(240);
  });

  it('never goes under the floor as the slot runs out', () => {
    // A second before the slot ends there is nothing worth holding for, and a
    // card up for one second is a flicker.
    expect(holdSeconds(detail({ offset_seconds: 479 }), 0)).toBe(CARD_SECONDS);
  });

  it('holds the floor for a channel that is off air', () => {
    // No slot running means nothing to wait for — the off-air card is held by
    // its own poll, not by this.
    expect(holdSeconds(offAir(), 0)).toBe(CARD_SECONDS);
  });

  it('holds the floor when the answer states no runtime', () => {
    // A channel with no runtime still shows a card; it just has no slot to run
    // the hold out against. There is no companion case for a missing OFFSET:
    // the endpoint never sends one without the other, so a test for it would be
    // asserting on a shape nothing produces.
    expect(holdSeconds(detail({ runtime_seconds: null }), 0)).toBe(CARD_SECONDS);
  });

  it('holds the floor with no answer at all', () => {
    expect(holdSeconds(null, 0)).toBe(CARD_SECONDS);
  });
});

describe('timedLines', () => {
  it('names the next three with their clock times', () => {
    expect(timedLines(detail())).toEqual([
      { time: '17:08', title: 'Hey Duggee', episode: 'The Tidying Up Badge · S1 E4' },
      { time: '17:15', title: 'Bluey',      episode: 'Bob Bilby · S1 E12' },
      { time: '17:22', title: 'Bluey',      episode: 'Neighbours · S1 E21' }
    ]);
  });

  // ⭐ TASK-592 story 1 — the line names the SHOW and puts the episode under it.
  // Before this row all three read the episode alone: "The Tidying Up Badge",
  // "Bob Bilby", "Neighbours" — three programmes on one card and not one of them
  // saying what show it was.
  it('leads with the show and carries the episode underneath it', () => {
    const lines = timedLines(detail());
    expect(lines.map(line => line.title)).toEqual(['Hey Duggee', 'Bluey', 'Bluey']);
    expect(lines.map(line => line.episode))
      .toEqual(['The Tidying Up Badge · S1 E4', 'Bob Bilby · S1 E12', 'Neighbours · S1 E21']);
  });

  // ⚠️ THE TIMED HALF KEEPS THE EPISODE, and that is the half of the principle
  // most likely to be "finished" later by collapsing these the way the later
  // list collapses. It must not be: the timed half exists to tell three
  // programmes apart, and three rows reading "Bluey" against three clocks tell
  // you less than the episode titles that were there before this row.
  it('does NOT collapse a repeat run — three Bluey slots stay three lines', () => {
    const lines = timedLines(detail({ next: REPEAT_RUN }));
    expect(lines.map(line => line.title)).toEqual(['Bluey', 'Bluey', 'Bluey']);
    expect(lines.map(line => line.episode))
      .toEqual(['Bob Bilby · S1 E12', 'Neighbours · S1 E21', 'The Magic Xylophone · S1 E1']);
    expect(lines.map(line => line.time)).toEqual(['17:08', '17:15', '17:22']);
  });

  // ⭐ TASK-592 story 4 — After Dark between two films. A film belongs to no
  // show, so the title line is the film and there is NO second line: the episode
  // is empty, and `.card-episode:empty` is what keeps the row one line tall.
  it('names a film alone, with no episode line under it', () => {
    expect(timedLines(detail({ next: FILMS }))).toEqual([
      { time: '21:00', title: 'Alien',     episode: '' },
      { time: '23:00', title: 'The Thing', episode: '' },
      { time: '01:00', title: 'Predator',  episode: '' }
    ]);
  });

  // A show the catalog numbers nothing for still reads — the show leads and the
  // episode's own title stands alone underneath, rather than "Bob Bilby · S
  // undefined E undefined". Both halves of the numbering are optional and
  // independently so; channels.js owns that and this proves the card gets it.
  it('draws an unnumbered episode without inventing a season or an episode', () => {
    const vague = detail({ next: [entry('bluey-s1e12', 'Bob Bilby', '2026-09-04T17:08:00',
      { id: 'series-bluey', title: 'Bluey', season: null, episode: null })] });
    expect(timedLines(vague)).toEqual([{ time: '17:08', title: 'Bluey', episode: 'Bob Bilby' }]);
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
      { time: '17:08', title: 'Hey Duggee', episode: 'The Tidying Up Badge · S1 E4' },
      { time: '17:15', title: 'Bluey',      episode: 'Bob Bilby · S1 E12' }
    ]);
  });

  it('names an id the catalog has forgotten rather than blanking the line', () => {
    // A six-month programme outlives the library under it, so a removed item
    // should read as a gap, not a blank row. It carries no show either, so the
    // id stands alone with nothing under it.
    const gone = detail({ next: [{ item: { item_id: 'gone-s1e01' }, starts_at: '2026-09-04T17:08:00' }] });
    expect(timedLines(gone)).toEqual([{ time: '17:08', title: 'gone-s1e01', episode: '' }]);
  });

  it('survives an answer with no lookahead at all', () => {
    expect(timedLines(detail({ next: [] }))).toEqual([]);
    expect(timedLines(detail({ next: null }))).toEqual([]);
    expect(timedLines(detail({ next: [null, undefined] }))).toEqual([]);
    expect(timedLines({})).toEqual([]);
    expect(timedLines(null)).toEqual([]);
  });
});

// TASK-592 — the later half is SHOWS, and it is the half where the two jobs of
// one fact come apart. The timed half tells three programmes apart and needs the
// episode; this half is one glance at what is on afterwards, so it collapses.
describe('laterTitles', () => {
  it('is the SHOWS after the timed lines, untimed', () => {
    // Four Bluey episodes follow the three timed lines, and they are one show.
    expect(laterTitles(detail())).toEqual(['Bluey']);
  });

  // ⭐ TASK-592 story 2 — a stretch of one show names it ONCE. Swapping the read
  // to the show without this ships "Bluey · Bluey · Bluey · Bluey", which is the
  // whole reason the row exists: TASK-585 makes the repeat the normal line-up.
  it('names a show once however many of its episodes are coming', () => {
    expect(laterTitles(detail({ next: REPEAT_RUN }))).toEqual(['Bluey', 'Hey Duggee']);
  });

  // ⭐ TASK-592 story 3, and the owner's 2026-09-10 call at build time. The later
  // half is the run of shows still to come READ ON ITS OWN — it does not check
  // what the timed lines said and does not go quiet when they said the same
  // thing. Shown both readings side by side, the owner took this one; the
  // alternative (drop a show the timed half already named, and lose the later
  // half entirely when there is only one show) was put to them and not taken.
  it('names a show the timed half ALREADY drew, rather than going quiet', () => {
    const oneShow = detail({ next: REPEAT_RUN.slice(0, 5) });
    expect(timedLines(oneShow).map(line => line.title)).toEqual(['Bluey', 'Bluey', 'Bluey']);
    expect(laterTitles(oneShow)).toEqual(['Bluey']);
  });

  it('keeps its later half when every line on the card is one show', () => {
    // The card does NOT lose its later half here. `card-rule` and
    // `card-later-block` hide on an EMPTY list, and this list is not empty.
    expect(laterTitles(detail({ next: REPEAT_RUN.slice(0, 5) })).length).toBe(1);
  });

  it('carries no times — the asymmetry IS the design', () => {
    // Every entry it draws from has a `starts_at`; none of it reaches the card.
    laterTitles(detail()).forEach(title => expect(typeof title).toBe('string'));
    expect(laterTitles(detail()).join(' ')).not.toContain(':');
  });

  // ⚠️ It carries no EPISODE either, which is the other direction the asymmetry
  // can be tidied away in. "Bluey · Bob Bilby · S1 E12 · Bluey · Neighbours · S1
  // E21" is a listing, and this half is a glance.
  it('carries no episode titles — the shows alone', () => {
    expect(laterTitles(detail()).join(' ')).not.toContain('Keepy Uppy');
    expect(laterTitles(detail()).join(' ')).not.toContain('S1 E');
  });

  it('caps at four DISTINCT SHOWS, so the card cannot grow down the screen', () => {
    // Six shows follow the timed lines and four is what the card has room for.
    const many = detail({ next: NEXT.slice(0, 3).concat([
      entry('a', 'A', '2026-09-04T17:29:00', { id: 's-a', title: 'Show A', season: 1, episode: 1 }),
      entry('b', 'B', '2026-09-04T17:36:00', { id: 's-b', title: 'Show B', season: 1, episode: 1 }),
      entry('c', 'C', '2026-09-04T17:43:00', { id: 's-c', title: 'Show C', season: 1, episode: 1 }),
      entry('d', 'D', '2026-09-04T17:50:00', { id: 's-d', title: 'Show D', season: 1, episode: 1 }),
      entry('e', 'E', '2026-09-04T17:57:00', { id: 's-e', title: 'Show E', season: 1, episode: 1 }),
      entry('f', 'F', '2026-09-04T18:04:00', { id: 's-f', title: 'Show F', season: 1, episode: 1 })
    ]) });
    expect(laterTitles(many)).toEqual(['Show A', 'Show B', 'Show C', 'Show D']);
    expect(laterTitles(many).length).toBe(LATER_LINES);
  });

  // ⚠️ THE CAP COUNTS SHOWS, WHICH MEANS THE DEDUPE RUNS FIRST. Capping the
  // entries and collapsing afterwards would let four episodes of one show fill
  // the list and then collapse it to a single name — the card would go quiet
  // exactly where it has the most to say.
  it('spends one of its four lines on a show, not one per episode', () => {
    const buried = detail({ next: NEXT.slice(0, 3).concat([
      NEXT[3], NEXT[4], NEXT[5], NEXT[6],
      entry('z', 'Z', '2026-09-04T18:04:00', { id: 's-z', title: 'Show Z', season: 1, episode: 1 })
    ]) });
    expect(laterTitles(buried)).toEqual(['Bluey', 'Show Z']);
  });

  it('is everything the timed half did NOT take, skipped entries included', () => {
    // An entry the timed half passed over for want of a clock is still
    // something that is on later — and counting off the front of the list
    // instead would lose it. The partition is still on ENTRIES; the collapse to
    // shows sits on top of it.
    const mixed = detail({ next: [entry('a', 'Unclocked', null), NEXT[0], NEXT[1], NEXT[2], NEXT[3]] });
    expect(timedLines(mixed).map(l => l.title)).toEqual(['Hey Duggee', 'Bluey', 'Bluey']);
    expect(laterTitles(mixed)).toEqual(['Unclocked', 'Bluey']);
  });

  it('never repeats the same show twice in its own run', () => {
    const titles = laterTitles(detail({ next: REPEAT_RUN }));
    expect(titles.length).toBe(new Set(titles).size);
  });

  it('keeps the shows in the order the channel airs them', () => {
    // The later half is a glance at what is on AFTERWARDS, so the first name is
    // the one coming soonest. A show's place in the run is where it FIRST airs,
    // not where it last does — grouping or sorting would lose both.
    const duggeeFirst = detail({ next: NEXT.slice(0, 3).concat([REPEAT_RUN[5], NEXT[4], REPEAT_RUN[6]]) });
    const blueyFirst = detail({ next: NEXT.slice(0, 3).concat([NEXT[4], REPEAT_RUN[5], NEXT[5]]) });
    expect(laterTitles(duggeeFirst)).toEqual(['Hey Duggee', 'Bluey']);
    expect(laterTitles(blueyFirst)).toEqual(['Bluey', 'Hey Duggee']);
  });

  it('is empty when the lookahead does not reach past the timed lines', () => {
    expect(laterTitles(detail({ next: NEXT.slice(0, 3) }))).toEqual([]);
    expect(laterTitles(detail({ next: [] }))).toEqual([]);
    expect(laterTitles(null)).toEqual([]);
  });

  it('names films by their own titles, because a film belongs to no show', () => {
    expect(laterTitles(detail({ next: FILMS }))).toEqual(['RoboCop']);
  });

  it('drops an entry it cannot name at all rather than listing a blank', () => {
    const nameless = detail({ next: NEXT.slice(0, 3).concat([{ item: null, starts_at: '2026-09-04T17:29:00' }, NEXT[4]]) });
    expect(laterTitles(nameless)).toEqual(['Bluey']);
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
        { time: '17:08', title: 'Hey Duggee', episode: 'The Tidying Up Badge · S1 E4' },
        { time: '17:15', title: 'Bluey',      episode: 'Bob Bilby · S1 E12' },
        { time: '17:22', title: 'Bluey',      episode: 'Neighbours · S1 E21' }
      ],
      later: ['Bluey']
    });
  });

  // ⭐ TASK-592 — ONE FACT, TWO JOBS, on one card. The timed half carries the
  // show AND the episode because it has to tell three programmes apart; the
  // later half carries the show alone because it is one glance at what is on
  // afterwards. Reading the two halves of this card side by side is the clearest
  // statement of the split there is.
  it('carries the episode in the timed half and the show alone underneath', () => {
    const view = cardView(detail({ next: REPEAT_RUN }));
    expect(view.timed.map(line => line.title + ' / ' + line.episode)).toEqual([
      'Bluey / Bob Bilby · S1 E12',
      'Bluey / Neighbours · S1 E21',
      'Bluey / The Magic Xylophone · S1 E1'
    ]);
    expect(view.later).toEqual(['Bluey', 'Hey Duggee']);
  });

  it('says nothing about being off air, because it is not', () => {
    const view = cardView(detail());
    expect(view.headline).toBe(null);
    expect(view.returnAt).toBe(null);
  });

  it('⚠️ never promises a return time while the channel is ON air', () => {
    // The answer can carry `next_on_air` alongside a live programme — the
    // backend fills in the next on-air moment whether or not anything is off.
    // A card in the GAP that read it would say "Back at 21:00" over a
    // programme starting in eight seconds: the channel contradicting itself in
    // the one place a viewer is looking. Only the holding card names a return.
    const view = cardView(detail({ next_on_air: '2026-09-04T21:00:00' }));
    expect(view.returnAt).toBe(null);
    expect(view.headline).toBe(null);
    expect(cardStatus(detail({ next_on_air: '2026-09-04T21:00:00' })).line)
      .toBe('Next: Hey Duggee at 17:08');
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
    expect(cardStatus(detail()).line).not.toContain('Bluey');
  });

  // ⭐ TASK-592 story 6 — the phone names the SHOW ALONE. It reads "Next: Bluey
  // at 17:08" where it read "Next: Bob Bilby at 17:08" before, and the episode
  // the television draws underneath deliberately does not follow it here: a
  // one-line detail belongs to what is on now, and the phone is a remote rather
  // than a second listing.
  it('names the show, and does not carry the episode over from the television', () => {
    expect(cardStatus(detail({ next: REPEAT_RUN })).line).toBe('Next: Bluey at 17:08');
    expect(cardStatus(detail()).line).toBe('Next: Hey Duggee at 17:08');
    expect(cardStatus(detail()).line).not.toContain('The Tidying Up Badge');
    expect(cardStatus(detail()).line).not.toContain('S1 E4');
  });

  // A film has no show, so the phone names the film — the line the card has
  // always drawn, unchanged by any of this.
  it('names a film by its own title', () => {
    expect(cardStatus(detail({ next: FILMS })).line).toBe('Next: Alien at 21:00');
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
