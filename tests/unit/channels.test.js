import {
  CHANNEL_KIND, CHANNELS_TAB,
  minutesLabel, positionLabel, tickedOffset, channelPercent, returnTimeLabel, clockLabel,
  itemTitle, seriesTitle, episodeSlot, leadTitle, channelSubLine,
  nextLabel, channelCardView, channelTile, channelTiles, railsOf,
  channelsById, hasChannels, withChannelsTab, landingTab, browseRestore,
  browseDrive, tileVariant, CHANNEL_TILE, LIBRARY_TILE
} from '../../core/channels.js';

// FEAT-560/TASK-563 — the Channels tab's model. The card TICKS and the strip's
// three states have to read right at every moment in between, so this is where
// "the card says the right thing" is proved: the screen modules are a thin
// mapping of what's below.

function onAir(over) {
  return Object.assign({
    channel_id: 'cartoon-club', name: 'Cartoon Club', item_type: 'episode',
    on_air: true, item: { item_id: 'bluey-s1e22', title: 'Bluey', poster: 'bluey.jpg' },
    offset_seconds: 120, runtime_seconds: 480, next_on_air: null,
    following: { item_id: 'bluey-s1e23', title: 'Keepy Uppy', poster: 'keepy.jpg' }
  }, over || {});
}

// TASK-588 — a resolved episode as api/channels.py sends it: its own title, and
// the show it belongs to beside it. "Blood" is a real Black Books episode title
// and names nothing on its own, which is the whole reason this task exists.
function episodeOf(show, season, episode) {
  return { item_id: 'bb-s2e4', title: 'Blood', poster: 'bb.jpg',
           series: { id: 'series-black-books', title: show,
                     season: season, episode: episode } };
}

function offAir(over) {
  return Object.assign({
    channel_id: 'after-dark', name: 'After Dark', item_type: 'film',
    on_air: false, item: null, offset_seconds: null, runtime_seconds: null,
    next_on_air: '2026-09-04T21:00:00', following: null
  }, over || {});
}

describe('minutesLabel', () => {
  it('floors to whole minutes so a card never reads ahead of the item', () => {
    expect(minutesLabel(0)).toBe('0m');
    expect(minutesLabel(59)).toBe('0m');
    expect(minutesLabel(60)).toBe('1m');
    expect(minutesLabel(119)).toBe('1m');
    expect(minutesLabel(6660)).toBe('111m');
  });

  it('never goes negative, and reads a missing value as zero', () => {
    expect(minutesLabel(-90)).toBe('0m');
    expect(minutesLabel(null)).toBe('0m');
    expect(minutesLabel(undefined)).toBe('0m');
  });
});

describe('positionLabel', () => {
  // Decision 14 — minutes, never a percentage: 28% is two minutes into a Bluey
  // or thirty-three into a film, and the question at the strip is "do I sit
  // down". Both halves are minutes; neither is ever a bare number.
  it('reads position over runtime', () => {
    expect(positionLabel(120, 480)).toBe('2m/8m');
    expect(positionLabel(2460, 6660)).toBe('41m/111m');
  });
});

describe('tickedOffset', () => {
  // The card is fetched once and carried by the clock from there — a position
  // baked at fetch time is wrong within a minute of render.
  it('advances the fetched offset by the seconds since', () => {
    expect(tickedOffset(onAir(), 45)).toBe(165);
  });

  it('clamps to the runtime rather than running past the item', () => {
    expect(tickedOffset(onAir(), 9999)).toBe(480);
  });

  it('carries on when the runtime is unknown', () => {
    expect(tickedOffset(onAir({ runtime_seconds: null }), 45)).toBe(165);
  });

  it('is null when nothing is on, and never runs backwards', () => {
    expect(tickedOffset(offAir(), 45)).toBe(null);
    expect(tickedOffset(onAir(), -30)).toBe(120);
    expect(tickedOffset(onAir(), null)).toBe(120);
  });
});

describe('channelPercent', () => {
  it('is the position over the runtime', () => {
    expect(channelPercent(120, 480)).toBe(25);
    expect(channelPercent(0, 480)).toBe(0);
    expect(channelPercent(480, 480)).toBe(100);
  });

  it('stays inside 0-100 whatever it is handed', () => {
    expect(channelPercent(600, 480)).toBe(100);
    expect(channelPercent(-60, 480)).toBe(0);
  });

  it('draws an empty bar rather than throwing on a missing runtime', () => {
    expect(channelPercent(120, null)).toBe(0);
    expect(channelPercent(120, 0)).toBe(0);
    expect(channelPercent(120, -5)).toBe(0);
    expect(channelPercent(null, 480)).toBe(0);
  });

  // An absent offset is a number away from a NaN bar width — the bar would be
  // drawn at `width: NaN%` and simply not appear, with nothing saying why.
  it('draws an empty bar rather than a NaN width when the offset is absent', () => {
    expect(channelPercent(undefined, 480)).toBe(0);
  });
});

describe('returnTimeLabel', () => {
  // Grammar call 3 — the programme promises 15:30 means 15:30, so the wire
  // carries a naive local wall clock and this reads it as written. Parsing to a
  // Date and formatting back is the one way to turn that into an hour's drift.
  it('names the hour and minute the channel is back', () => {
    expect(returnTimeLabel('2026-09-04T21:00:00')).toBe('Back at 21:00');
    expect(returnTimeLabel('2026-12-25T06:30:00')).toBe('Back at 06:30');
  });

  it('is null when the programme names no return', () => {
    expect(returnTimeLabel(null)).toBe(null);
    expect(returnTimeLabel(undefined)).toBe(null);
    expect(returnTimeLabel('')).toBe(null);
  });

  it('is null rather than a mangled label for anything not a wall clock', () => {
    expect(returnTimeLabel('not-a-time')).toBe(null);
    expect(returnTimeLabel('2026-09-04')).toBe(null);
    expect(returnTimeLabel(21)).toBe(null);
  });

  // A clock buried inside some other string is not a return time. Reading one
  // out of it would put a confident "Back at 21:00" on a card off the back of
  // whatever the field actually held.
  it('is null for a stamp that does not start where the string does', () => {
    expect(returnTimeLabel('scheduled 2026-09-04T21:00:00')).toBe(null);
  });
});

// TASK-565 — the same read, without the wording. THE one place a wall-clock
// stamp is read in the app: the interstitial's timed lines go through this
// exactly as the off-air card's return time does, so a second copy cannot
// quietly start parsing to a Date and drifting an hour.
describe('clockLabel', () => {
  it('is the hour and minute, as written', () => {
    expect(clockLabel('2026-09-04T21:00:00')).toBe('21:00');
    expect(clockLabel('2026-12-25T06:30:00')).toBe('06:30');
  });

  it('reads a stamp with no seconds on it just the same', () => {
    expect(clockLabel('2026-09-04T21:00')).toBe('21:00');
  });

  it('is null for anything that is not a whole stamp', () => {
    expect(clockLabel(null)).toBe(null);
    expect(clockLabel('')).toBe(null);
    expect(clockLabel('21:00')).toBe(null);
    expect(clockLabel('2026-09-04')).toBe(null);
    expect(clockLabel('scheduled 2026-09-04T21:00:00')).toBe(null);
    expect(clockLabel(21)).toBe(null);
  });

  it('is what returnTimeLabel is built on, so the two cannot disagree', () => {
    expect(returnTimeLabel('2026-09-04T21:00:00'))
      .toBe('Back at ' + clockLabel('2026-09-04T21:00:00'));
  });
});

describe('itemTitle', () => {
  it('names the item', () => {
    expect(itemTitle({ item_id: 'x', title: 'Bluey' })).toBe('Bluey');
  });

  // api/channels.py resolves an id the catalog no longer knows to a minimal
  // entry on purpose: a six-month programme outlives the library under it, and
  // a removed item should leave a readable gap, not a broken tile.
  it('falls back to the id when the catalog no longer knows the item', () => {
    expect(itemTitle({ item_id: 'gone-2019' })).toBe('gone-2019');
  });

  it('is empty when nothing is on', () => {
    expect(itemTitle(null)).toBe('');
    expect(itemTitle(undefined)).toBe('');
    expect(itemTitle({})).toBe('');
  });
});

// TASK-588 — an episode says what show it is. api/channels.py sends the `series`
// block on an episode it can place and null on everything else, so nothing here
// asks what kind of item it is looking at.
describe('seriesTitle', () => {
  it('names the show', () => {
    expect(seriesTitle(episodeOf('Black Books', 2, 4))).toBe('Black Books');
  });

  it('is empty for anything with no show — a film, a track, a home movie', () => {
    expect(seriesTitle({ item_id: 'alien', title: 'Alien', series: null })).toBe('');
    expect(seriesTitle({ item_id: 'alien', title: 'Alien' })).toBe('');
    expect(seriesTitle(null)).toBe('');
    expect(seriesTitle(undefined)).toBe('');
  });

  it('is empty for a show the catalog never named', () => {
    expect(seriesTitle({ title: 'Blood', series: { id: 'black-books' } })).toBe('');
    expect(seriesTitle({ title: 'Blood', series: { id: 'x', title: '' } })).toBe('');
  });
});

describe('episodeSlot', () => {
  it('is the episode and where it sits in the show', () => {
    expect(episodeSlot(episodeOf('Black Books', 2, 4))).toBe('Blood · S2 E4');
  });

  // A show that numbered nothing still reads — the missing half costs the
  // numbers, never the episode's own name.
  it('drops the numbers rather than the name when the show numbers nothing', () => {
    expect(episodeSlot(episodeOf('By Age', null, null))).toBe('Blood');
    expect(episodeSlot(episodeOf('By Age', 2, null))).toBe('Blood');
    expect(episodeSlot(episodeOf('By Age', null, 4))).toBe('Blood');
  });

  // Season and episode zero are real numbers — a Christmas special is S0 E1 —
  // so the check is against null, never falsiness.
  it('draws a season or episode of zero, which is a real number', () => {
    expect(episodeSlot(episodeOf('Black Books', 0, 1))).toBe('Blood · S0 E1');
    expect(episodeSlot(episodeOf('Black Books', 2, 0))).toBe('Blood · S2 E0');
  });

  it('names the id when the catalog forgot the episode but still places it', () => {
    expect(episodeSlot({ item_id: 'gone', series: { title: 'Black Books', season: 1, episode: 2 } }))
      .toBe('gone · S1 E2');
  });

  it('is empty for anything with no show — a film draws no second line', () => {
    expect(episodeSlot({ item_id: 'alien', title: 'Alien', series: null })).toBe('');
    expect(episodeSlot(null)).toBe('');
    expect(episodeSlot({})).toBe('');
  });
});

// THE principle — the recognisable half leads.
describe('leadTitle', () => {
  it('is the show when there is one, because a viewer recognises the show', () => {
    expect(leadTitle(episodeOf('Black Books', 2, 4))).toBe('Black Books');
  });

  it('is the item itself when there is no show — every film, track and clip', () => {
    expect(leadTitle({ item_id: 'alien', title: 'Alien' })).toBe('Alien');
  });

  it('still falls back to the id the catalog no longer knows', () => {
    expect(leadTitle({ item_id: 'gone-2019' })).toBe('gone-2019');
    expect(leadTitle(null)).toBe('');
  });
});

// TASK-570 — the fourth line, so a channel nearly over still says whether it is
// worth sitting down.
describe('nextLabel', () => {
  it('names the programme after this one', () => {
    expect(nextLabel({ item_id: 'bluey-s1e23', title: 'Keepy Uppy' }))
      .toBe('Next: Keepy Uppy');
  });

  // TASK-588 — "Next: Librarian" answers nothing. The show, not the episode:
  // this line exists to say whether it is worth sitting down.
  it('names the SHOW after this one, not its episode', () => {
    expect(nextLabel(episodeOf('Not Going Out', 2, 3))).toBe('Next: Not Going Out');
  });

  it('falls back to the id the catalog no longer knows, as the card above does', () => {
    expect(nextLabel({ item_id: 'gone' })).toBe('Next: gone');
  });

  it('is empty when the channel names nothing after this — no blank row', () => {
    expect(nextLabel(null)).toBe('');
    expect(nextLabel(undefined)).toBe('');
    expect(nextLabel({})).toBe('');
    expect(nextLabel({ title: '' })).toBe('');
  });
});

describe('channelCardView', () => {
  it('on air: what is playing, its position and a bar that has moved', () => {
    var v = channelCardView(onAir(), 60);
    expect(v.onAir).toBe(true);
    expect(v.name).toBe('Cartoon Club');
    expect(v.title).toBe('Bluey');
    expect(v.time).toBe('3m/8m');
    expect(v.percent).toBeCloseTo(37.5);
    expect(v.poster).toBe('bluey.jpg');
  });

  // Story 1 — the line sits BESIDE what is on now, never in place of it.
  it('on air: says what is on after this, alongside what is on now', () => {
    var v = channelCardView(onAir(), 60);
    expect(v.title).toBe('Bluey');
    expect(v.next).toBe('Next: Keepy Uppy');
  });

  // Story 3.
  it('on air with nothing after it: the card loses the line', () => {
    expect(channelCardView(onAir({ following: null }), 60).next).toBe('');
  });

  // TASK-588 story 1 — the card leads with Black Books and puts Blood under it.
  it('on air with an episode: the SHOW is the title, the episode sits under it', () => {
    var v = channelCardView(onAir({ item: episodeOf('Black Books', 2, 4) }), 60);
    expect(v.title).toBe('Black Books');
    expect(v.episode).toBe('Blood · S2 E4');
    expect(channelSubLine(v)).toBe('Blood · S2 E4 · 3m/8m');
  });

  // TASK-588 story 3 — a film, a home movie, a track or a music video draws
  // exactly as it did before this task.
  it('on air with no show: the card is unchanged, with no second line', () => {
    var v = channelCardView(onAir(), 60);
    expect(v.title).toBe('Bluey');
    expect(v.episode).toBe('');
    expect(channelSubLine(v)).toBe('3m/8m');
  });

  // TASK-588 story 4.
  it('on air with an episode the catalog knows no show for: its own title, nothing else', () => {
    var v = channelCardView(
      onAir({ item: { item_id: 'orphan', title: 'Blood', series: null } }), 60);
    expect(v.title).toBe('Blood');
    expect(v.episode).toBe('');
  });

  // Story 4, first half — the endpoint gave a return time, so the card names it.
  it('off air with a return time: says so, and when it is back', () => {
    var v = channelCardView(offAir(), 60);
    expect(v.onAir).toBe(false);
    expect(v.name).toBe('After Dark');
    expect(v.title).toBe('Off air');
    expect(v.time).toBe('Back at 21:00');
    expect(v.percent).toBe(0);
    expect(v.poster).toBe(null);
  });

  // Story 2 — the return time is not replaced, and not said twice. Even handed
  // a following item, an off-air card draws no fourth line.
  it('off air: the return time stands alone, with no following line', () => {
    expect(channelCardView(offAir(), 60).next).toBe('');
    expect(channelCardView(
      offAir({ following: { item_id: 'x', title: 'Later Thing' } }), 60).next)
      .toBe('');
  });

  // Story 4, second half, and the owner's 2026-09-03 call: a channel between
  // slots with nothing left, one nobody has regenerated, and one whose window
  // has run out are ONE state. There is deliberately no third card.
  it('off air with no return time: says only that, naming nothing', () => {
    var v = channelCardView(offAir({ next_on_air: null }), 60);
    expect(v.onAir).toBe(false);
    expect(v.title).toBe('Off air');
    expect(v.time).toBe(null);
    expect(v.percent).toBe(0);
  });

  // TASK-588 — off air has no episode to name, so the sub line is the return
  // time alone, exactly what that line has always carried.
  it('off air: the sub line is the return time and nothing else', () => {
    expect(channelSubLine(channelCardView(offAir(), 60))).toBe('Back at 21:00');
    expect(channelSubLine(channelCardView(offAir({ next_on_air: null }), 60))).toBe('');
    expect(channelCardView(offAir(), 60).episode).toBe('');
  });

  it('draws an unnamed channel off air too', () => {
    var v = channelCardView(offAir({ name: null }), 0);
    expect(v.name).toBe('');
    expect(v.title).toBe('Off air');
  });

  it('draws an unnamed channel and an unresolved item without breaking', () => {
    var v = channelCardView(onAir({ name: null, item: { item_id: 'gone' } }), 0);
    expect(v.name).toBe('');
    expect(v.title).toBe('gone');
    expect(v.poster).toBe(null);
  });

  it('an on-air channel with nothing resolved still draws a card', () => {
    var v = channelCardView(onAir({ item: null }), 0);
    expect(v.title).toBe('');
    expect(v.poster).toBe(null);
  });
});

describe('channelTile', () => {
  it('is an action tile carrying the channel and how to open it', () => {
    var t = channelTile(onAir());
    expect(t.kind).toBe(CHANNEL_KIND);
    expect(t.kind).toBe('channel');
    expect(t.id).toBe('channel:cartoon-club');
    expect(t.channelId).toBe('cartoon-club');
    expect(t.title).toBe('Cartoon Club');
    expect(t.navParams).toEqual({ channel: 'cartoon-club' });
    expect(t.line.item.title).toBe('Bluey');
  });

  // navParams carries the id and NOTHING else — the player asks the endpoint
  // where the channel has got to, so a position can never reach it stale
  // through a URL.
  it('carries no position in its nav params', () => {
    expect(Object.keys(channelTile(onAir()).navParams)).toEqual(['channel']);
  });

  it('falls back to the id when a channel has no name', () => {
    expect(channelTile(onAir({ name: null })).title).toBe('cartoon-club');
  });
});

describe('channelTiles', () => {
  it('keeps the order the endpoint sent — the backend owns channel order', () => {
    var tiles = channelTiles([onAir(), offAir()]);
    expect(tiles.map(function(t) { return t.channelId; })).toEqual(['cartoon-club', 'after-dark']);
  });

  it('is no tile at all when there are no channels', () => {
    expect(channelTiles([])).toEqual([]);
    expect(channelTiles(null)).toEqual([]);
  });
});

// TASK-626 — what a channel SAYS about where it belongs. The grouping that acts
// on it lives beside the genre rails (tests/unit/home-rails.test.js).
describe('railsOf', () => {
  it('reads the rails a channel opts into, in the order its config names them', () => {
    expect(railsOf(onAir({ rails: ['films', 'comedy'] }))).toEqual(['films', 'comedy']);
  });

  it('reads a channel naming none as no rails', () => {
    expect(railsOf(onAir())).toEqual([]);
    expect(railsOf(onAir({ rails: null }))).toEqual([]);
  });

  it('reads a backend too old to send the field as no rails', () => {
    expect(railsOf({ channel_id: 'comfort' })).toEqual([]);
    expect(railsOf(null)).toEqual([]);
    expect(railsOf(undefined)).toEqual([]);
  });

  it('refuses a value that is not a list rather than fanning a string out', () => {
    expect(railsOf(onAir({ rails: 'films' }))).toEqual([]);
    expect(railsOf(onAir({ rails: {} }))).toEqual([]);
  });
});

describe('tileVariant', () => {
  // The whole point: a channel card must never reach the library renderer,
  // whose bar is watch progress. Every other card must never reach the
  // channel one.
  it('sends a channel card to the channel renderer', () => {
    expect(tileVariant(channelTile(onAir()))).toBe(CHANNEL_TILE);
    expect(tileVariant({ kind: 'channel' })).toBe('channel');
  });

  it('sends everything else to the library renderer', () => {
    expect(tileVariant({ kind: 'video', id: 'toy-story' })).toBe(LIBRARY_TILE);
    expect(tileVariant({ kind: 'series' })).toBe('library');
    expect(tileVariant({ kind: 'play-all' })).toBe(LIBRARY_TILE);
    expect(tileVariant({})).toBe(LIBRARY_TILE);
    expect(tileVariant(null)).toBe(LIBRARY_TILE);
    expect(tileVariant(undefined)).toBe(LIBRARY_TILE);
  });
});

describe('channelsById', () => {
  it('keys the lines by channel id so a tick can find one per element', () => {
    var byId = channelsById([onAir(), offAir()]);
    expect(byId['cartoon-club'].name).toBe('Cartoon Club');
    expect(byId['after-dark'].on_air).toBe(false);
  });

  it('is empty for no channels', () => {
    expect(channelsById([])).toEqual({});
    expect(channelsById(null)).toEqual({});
  });
});

describe('hasChannels and withChannelsTab', () => {
  var TABS = [{ id: 'series', title: 'TV Series' }, { id: 'films', title: 'Films' }];

  it('puts Channels first in the sidebar', () => {
    var tabs = withChannelsTab(TABS, [onAir()]);
    expect(tabs.map(function(t) { return t.id; })).toEqual(['channels', 'series', 'films']);
    expect(tabs[0].title).toBe('Channels');
    expect(tabs[0]).toEqual(CHANNELS_TAB);
  });

  // Story 6 — a default tab that can be EMPTY is worse than no default. With no
  // channel configured, or none this profile may see (the likelier of the two
  // since TASK-569), there is no Channels tab at all.
  it('adds no tab when there are no channels', () => {
    expect(withChannelsTab(TABS, [])).toEqual(TABS);
    expect(withChannelsTab(TABS, null)).toEqual(TABS);
    expect(hasChannels([])).toBe(false);
    expect(hasChannels(null)).toBe(false);
    expect(hasChannels([onAir()])).toBe(true);
  });

  it('leaves the media-type tabs alone', () => {
    expect(withChannelsTab(null, [])).toEqual([]);
    expect(withChannelsTab(TABS, [onAir()]).slice(1)).toEqual(TABS);
  });
});

describe('landingTab', () => {
  var IDS = ['channels', 'series', 'films'];
  var NO_CHANNELS = ['series', 'films'];

  // Story 1 / decision 10 — opening the TV shows what's on, so Channels
  // outranks the tab a previous session left behind.
  it('lands on Channels over a remembered tab', () => {
    expect(landingTab(IDS, null, 'films', [onAir()])).toBe('channels');
  });

  // An explicit ?tab= is someone naming a destination (a rail-grid breadcrumb),
  // so it still wins.
  it('lets an explicit tab win over Channels', () => {
    expect(landingTab(IDS, 'films', null, [onAir()])).toBe('films');
  });

  it('ignores a tab that is not on the sidebar', () => {
    expect(landingTab(IDS, 'music', 'series', [onAir()])).toBe('channels');
    expect(landingTab(NO_CHANNELS, 'music', 'films', [])).toBe('films');
  });

  // Story 6 again — with no channels the previous behaviour is untouched.
  it('falls back to the remembered tab, then the first one', () => {
    expect(landingTab(NO_CHANNELS, null, 'films', [])).toBe('films');
    expect(landingTab(NO_CHANNELS, null, null, [])).toBe('series');
    expect(landingTab(NO_CHANNELS, null, 'music', [])).toBe('series');
  });

  it('never names Channels when the tab is not there', () => {
    expect(landingTab(NO_CHANNELS, null, null, [onAir()])).toBe('series');
  });

  it('is undefined with no tabs at all', () => {
    expect(landingTab([], null, null, [])).toBe(undefined);
    expect(landingTab(null, null, null, [])).toBe(undefined);
  });
});

// TASK-564/TASK-626 — reopening the companion's browse drill from a recorded
// trail entry. One rule for every section now the Channels tab has several
// rails: a recorded rail is the rail the phone reopens on. Where the TV is sent
// for that same entry is browseDrive's question, below.
describe('browseRestore', () => {
  it('reopens Channels on the rail the phone was in, not the first one', () => {
    expect(browseRestore({ tab: 'channels', rail: 'channel-rail:films' }))
      .toEqual({ section: 'channels', rail: 'channel-rail:films', level: 'grid' });
  });

  it('reopens a channels entry with no rail on the tab rails', () => {
    expect(browseRestore({ tab: 'channels' }))
      .toEqual({ section: 'channels', rail: null, level: 'rails' });
  });

  it('reopens any other section on its recorded rail', () => {
    expect(browseRestore({ tab: 'series', rail: 'genre:animation' }))
      .toEqual({ section: 'series', rail: 'genre:animation', level: 'grid' });
  });

  it('reopens a tab with no rail on that section rails', () => {
    expect(browseRestore({ tab: 'films' })).toEqual({ section: 'films', rail: null, level: 'rails' });
  });

  it('reopens an empty entry at the sections root', () => {
    expect(browseRestore({})).toEqual({ section: null, rail: null, level: 'sections' });
    expect(browseRestore(null)).toEqual({ section: null, rail: null, level: 'sections' });
  });
});

// TASK-626 — where the TV goes for a recorded entry. The Channels tab is the
// one section with no rail-grid page behind it, so its entry names the browse
// tab however deep the phone is; every other section keeps the rail-grid target
// TASK-564 relied on.
describe('browseDrive', () => {
  it('sends the TV to the Channels tab even from inside a rail', () => {
    expect(browseDrive({ tab: 'channels', rail: 'channel-rail:films' }))
      .toEqual({ page: 'browse.html', params: { tab: 'channels' } });
  });

  it('sends the TV to the rail grid for any other section', () => {
    expect(browseDrive({ tab: 'series', rail: 'genre:animation' }))
      .toEqual({ page: 'rail-grid.html', params: { section: 'series', rail: 'genre:animation' } });
  });

  it('sends the TV to the browse tab when the entry names no rail', () => {
    expect(browseDrive({ tab: 'films' }))
      .toEqual({ page: 'browse.html', params: { tab: 'films' } });
    expect(browseDrive({})).toEqual({ page: 'browse.html', params: { tab: null } });
    expect(browseDrive(null)).toEqual({ page: 'browse.html', params: { tab: null } });
  });
});
