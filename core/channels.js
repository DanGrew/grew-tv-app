// Channels (FEAT-560/TASK-563) — the pure model behind the Channels tab: what
// each channel's card says, and whether the tab exists at all. DOM lives in
// ui/screens/screen-browse.js and components/tile.js; this file is the logic,
// so "the card reads right in every state" is provable without a browser.
//
// Fed by GET /api/channels?profile= (grew-tv api/channels.py), one on-now line
// per channel this profile may see:
//   { channel_id, name, item_type, rails, on_air, item, offset_seconds,
//     runtime_seconds, next_on_air, following }
// `rails` is the slugs of the tab's rails this channel belongs on, in config
// order, and empty for a channel naming none (TASK-626).
// `item` is a resolved catalog entry, a minimal { item_id } for an id the
// catalog no longer knows, or null when nothing is on. `following` is the one
// programme after it, in the same shape, or null (TASK-570).
//
// ⚠️ THE BAR IS THE CHANNEL'S POSITION, NOT THE VIEWER'S (decision 14). It
// wears the same shape as core/tile-model.js's watch-progress bar and means the
// opposite thing, so a channel card deliberately does NOT go through tileModel:
// there is no path here that can read core/progress.js. Keep it that way.

// A channel card is an ACTION tile (the playAllTile precedent in
// core/home-rails.js — kind + navParams, never a browse card), so it can never
// be mistaken for something in the library and never picks up a ＋Queue badge
// or a resume bar. Its `kind` is in home-rails.js CARD_ROUTES, which
// arch-check's no-missing-card-route rule enforces.
export var CHANNEL_KIND = 'channel';

// The tab itself. First in SECTION_ORDER's display order and the tab browse
// lands on (decision 10): opening the TV shows what's on, rather than asking
// which media type you want before showing you anything.
export var CHANNELS_TAB = { id: 'channels', title: 'Channels' };

// The tab's fallback rail: every channel that names none of its own lands here
// (TASK-626), which is the whole strip as it stood before rails existed. Not a
// catalog rail — a small fixed strip that needs no paging (decision 17), which
// is why FEAT-547 doesn't gate this.
export var CHANNELS_RAIL = 'channels';
export var CHANNELS_RAIL_TITLE = 'On now';

var OFF_AIR = 'Off air';

// One separator, everywhere an episode's facts are strung together (TASK-588).
var DOT = ' · ';

// Minutes, never a percentage (decision 14): 28% is two minutes into a Bluey or
// thirty-three into a film, and the question at the strip is "do I sit down".
// The percentage appears as geometry instead — the bar below.
//
// Floored, so a card reads 0m for the first minute rather than rounding up to
// 1m before the item has started. Runtime floors too: an item is over when its
// stated minutes are up, not a rounding later.
export function minutesLabel(seconds) {
  return Math.max(0, Math.floor((seconds || 0) / 60)) + 'm';
}

// `2m/8m` — position over runtime, one format everywhere.
export function positionLabel(offsetSeconds, runtimeSeconds) {
  return minutesLabel(offsetSeconds) + '/' + minutesLabel(runtimeSeconds);
}

// The card TICKS (decision 14) — a position baked at fetch time is wrong within
// a minute of render. The strip is fetched once and the clock carries it from
// there: offset at fetch, plus real seconds elapsed since.
//
// Clamped to the runtime so a card that outlives its item sits full rather than
// running past 100%: the next poll is what moves it on to the next programme
// entry, and until then "this item has finished" is the honest reading.
export function tickedOffset(line, elapsedSeconds) {
  var offset = line.offset_seconds;
  if (offset == null) return null;
  var runtime = line.runtime_seconds;
  var moved = offset + Math.max(0, elapsedSeconds || 0);
  if (runtime == null) return moved;
  return Math.min(moved, runtime);
}

// How full the bar is, 0-100. Zero rather than a throw when the runtime is
// missing or nonsensical: a channel with no runtime still draws a card, it just
// draws an empty bar.
//
// One guard, not three. A runtime of zero has to be caught before the division
// (it would otherwise divide to Infinity and draw a FULL bar for an item with no
// stated length), but everything else the earlier guards checked for — a
// negative runtime, a missing offset — the clamp already answers with 0. So the
// runtime is asked one question, `> 0`, which null, zero, a negative and a
// non-number all fail; and a missing offset falls through to `|| 0`, which is
// what turns NaN into an empty bar rather than a NaN width.
export function channelPercent(offsetSeconds, runtimeSeconds) {
  var runtime = Number(runtimeSeconds);
  if (!(runtime > 0)) return 0;
  var percent = (Number(offsetSeconds) / runtime) * 100;
  return Math.max(0, Math.min(100, percent || 0));
}

// `next_on_air` as the wire carries it: a naive local wall-clock ISO string
// ("2026-09-04T21:00:00"), or null.
//
// Read by matching the stamp whole, never by `new Date` — the programme promises
// 15:30 means 15:30 (grammar call 3: DST is not modelled, and the backend
// deliberately stamps no zone). Parsing to a Date and formatting back is the one
// way to turn that promise into an hour's drift, so this never constructs one.
//
// The pattern is anchored and covers the date too, so the hours and minutes are
// only read out of something shaped like the whole stamp: a string carrying a
// clock somewhere inside it is not a return time, and reads as no return time at
// all. Anything that isn't a stamp — null, a number, a bare date — stringifies
// to something the pattern refuses, so there is no separate type guard to keep
// in step with it.
var RETURN_AT = /^\d\d\d\d-\d\d-\d\dT(\d\d:\d\d)/;

// The clock a stamp names, or null for anything that is not one. THE one reader
// of a wall-clock stamp in the app (TASK-565): the interstitial's timed lines
// read `starts_at` exactly as the off-air card reads `next_on_air`, and a second
// copy of this pattern is how one of them would quietly start parsing to a Date.
export function clockLabel(stamp) {
  var at = RETURN_AT.exec(String(stamp));
  return at ? at[1] : null;
}

export function returnTimeLabel(nextOnAir) {
  var at = clockLabel(nextOnAir);
  return at ? 'Back at ' + at : null;
}

// What the item on air is called. An id the catalog no longer knows still draws
// a card naming the id (api/channels.py resolves it to a minimal entry on
// purpose — a six-month programme outlives the library under it), so a removed
// item leaves a readable gap rather than a blank tile.
export function itemTitle(item) {
  if (!item) return '';
  return item.title || item.item_id || '';
}

// TASK-588 — the show an item belongs to, when the catalog holds one.
// api/channels.py sends `series: {id, title, season, episode}` on an episode it
// can place, and null on everything else: a film, a track, a music video, a home
// movie, and an episode belonging to no series. So nothing here asks what kind of
// item this is — the block is present or it is not.
export function seriesTitle(item) {
  var series = (item || {}).series;
  if (!series) return '';
  return series.title || '';
}

// Where an episode sits in its show — "Blood · S2 E4". The episode's own title
// leads, because the show has already been said above it.
//
// A show that numbers nothing still reads: "Blood" alone, rather than "Blood ·
// S undefined". Both halves are optional and independently so — the catalog is
// the authority on what it knows, and a gap in it should cost the missing half
// and nothing else.
//
// Empty for anything with no show at all: a film's card has no second line to
// draw, and never had one.
export function episodeSlot(item) {
  if (!seriesTitle(item)) return '';
  var series = item.series;
  if (series.season == null || series.episode == null) return itemTitle(item);
  return itemTitle(item) + DOT + 'S' + series.season + ' E' + series.episode;
}

// THE PRINCIPLE, in one function: the recognisable half leads. A viewer scanning
// the strip recognises Black Books and never "Blood", so the show is the title
// line whenever there is one — and the item's own title otherwise, which is every
// film, track, music video and home movie, drawing exactly as it always did.
export function leadTitle(item) {
  return seriesTitle(item) || itemTitle(item);
}

// What the card says comes after the one playing — the fourth line, so a
// channel two minutes from the end still says whether it is worth sitting down
// (TASK-570).
//
// Empty rather than a placeholder when the channel names nothing after this:
// story 3 is that the card loses the line, never that it grows a blank row
// where the line would be. Off air never reaches here at all — what follows is
// the return time the card already draws, and saying it twice was the thing
// the owner ruled out.
// TASK-588 — it names the SHOW, for the same reason the title line does: "Next:
// Librarian" answers nothing, and this line exists to say whether it is worth
// sitting down. Just the show, not its episode: the card's one detail line
// belongs to what is on NOW, and a 420px tile with two episode subtitles on it
// reads as neither.
var NEXT_PREFIX = 'Next: ';

export function nextLabel(following) {
  var title = leadTitle(following);
  if (!title) return '';
  return NEXT_PREFIX + title;
}

// One channel's card, fully resolved for render. Three states, never more:
//
//   on air        — what's playing, `2m/8m`, what's after it, and a bar that fills
//   off air, timed— "Off air" and when it's back
//   off air, plain— "Off air", naming nothing
//
// The third is a channel between slots with nothing left in its programme, a
// channel nobody has regenerated, and one whose programme has run out: the backend
// answers all three identically and there is deliberately no fourth card
// (decision 8, and the owner's 2026-09-03 call on expiry). Don't add one.
export function channelCardView(line, elapsedSeconds) {
  var offset = tickedOffset(line, elapsedSeconds);
  if (!line.on_air) {
    return { onAir: false, name: line.name || '', title: OFF_AIR, episode: '',
             time: returnTimeLabel(line.next_on_air), next: '', percent: 0,
             poster: null };
  }
  return {
    onAir: true,
    name: line.name || '',
    title: leadTitle(line.item),
    episode: episodeSlot(line.item),
    time: positionLabel(offset, line.runtime_seconds),
    next: nextLabel(line.following),
    percent: channelPercent(offset, line.runtime_seconds),
    poster: (line.item || {}).poster || null
  };
}

// The card's sub line, composed: "Blood · S2 E4 · 8m/22m" for an episode, and
// the bare "8m/22m" a film has always drawn. Off air it is the return time
// alone, which is what that line has always been there for.
//
// It lives HERE rather than in the tile because a composed string is logic, and
// the two surfaces that draw this card must not each carry their own idea of
// what order the facts go in.
export function channelSubLine(view) {
  return [view.episode, view.time].filter(Boolean).join(DOT);
}

// A channel as an action tile. `navParams` carries what opening it needs and
// nothing more — the player asks the endpoint itself for where the channel has
// got to, so a stale offset can never be handed to it through a URL.
export function channelTile(line) {
  return {
    kind: CHANNEL_KIND,
    id: channelTileId(line.channel_id),
    channelId: line.channel_id,
    title: line.name || line.channel_id,
    line: line,
    navParams: { channel: line.channel_id }
  };
}

// The strip's tiles, in the order the endpoint sent them (id order — the
// backend owns channel order, the app never re-sorts it).
export function channelTiles(lines) {
  return (lines || []).map(channelTile);
}

// TASK-626 — the rails one channel opts into, as api/channels.py sends them: a
// list of slugs in the order its config names them, and empty for a channel
// naming none.
//
// Empty for a backend too old to send the field at all, which is the same
// answer and puts the card exactly where it has always been — so the app can
// ship before the backend does, and the field arriving changes the tab without
// the app changing again.
//
// The grouping itself lives in core/home-rails.js beside the genre rails,
// because a channel rail is built by the same slug grouping and must not grow a
// second idea of how a slug becomes a heading. This file stays what a channel
// SAYS; that one stays how rails are made.
export function railsOf(line) {
  var rails = (line || {}).rails;
  return Array.isArray(rails) ? rails : [];
}

// Which renderer a browse card takes. A channel card has its own on both
// surfaces — createChannelTile on the TV, the text tile on the phone — because
// the library tile derives its bar from watch progress and a channel's comes
// from the schedule. Named rather than boolean so both screens stay a plain
// table lookup with no branch of their own.
export var CHANNEL_TILE = 'channel';
export var LIBRARY_TILE = 'library';

export function tileVariant(card) {
  return (card || {}).kind === CHANNEL_KIND ? CHANNEL_TILE : LIBRARY_TILE;
}

// The strip's lines keyed by channel id, so a tick can re-apply a card's view
// from the id its element carries without walking the list per tile.
export function channelsById(lines) {
  var byId = {};
  (lines || []).forEach(function(line) { byId[line.channel_id] = line; });
  return byId;
}

// Whether the tab exists. Story 6 — with no channel configured, or none this
// profile may see, there is no Channels tab and browse lands where it used to.
// A default tab that can be EMPTY is worse than no default (decision 10), and
// the kids profile seeing none is the likelier cause of the two now that a
// channel declares who may see it (TASK-569).
export function hasChannels(lines) {
  return (lines || []).length > 0;
}

// The sidebar tabs, with Channels first when there are any. Takes buildTabs'
// output rather than replacing it, so the media-type tabs stay entirely the
// backend's business.
export function withChannelsTab(tabs, lines) {
  var rest = tabs || [];
  return hasChannels(lines) ? [CHANNELS_TAB].concat(rest) : rest;
}

// Which tab browse opens on. An explicit ?tab= (a breadcrumb crumb, a deep
// link) wins — that is someone naming a destination. Otherwise Channels, per
// decision 10: "opening the TV shows what's on" is the whole point of the tab,
// and it outranks the last-visited tab a session left behind. With no channels
// the previous behaviour is untouched: the remembered tab, then the first one.
export function landingTab(tabIds, requestedTab, lastTab, lines) {
  var ids = tabIds || [];
  var known = function(id) { return id && ids.indexOf(id) >= 0; };
  if (known(requestedTab)) return requestedTab;
  if (hasChannels(lines) && known(CHANNELS_TAB.id)) return CHANNELS_TAB.id;
  if (known(lastTab)) return lastTab;
  return ids[0];
}

// TASK-564 — where the companion's browse drill reopens from a recorded trail
// entry. A recorded entry is TWO things at once: the position the phone reopens
// at, and the target a later breadcrumb press sends the TV to. For every other
// section those agree, because both surfaces show a rail's items on a
// `rail-grid` page. Channels is the one section where they don't (decision 10 —
// it is a browse TAB on the TV, with no rail-grid behind it).
//
// ⚠️ TASK-626 — this used to answer the channels rail from the tab alone,
// "because the section has exactly one". It has several now, so the tab no
// longer names which one the phone was in and a channels entry carries its rail
// like every other section's. One rule for every entry: a rail means the grid,
// a tab alone means that section's rails, neither means the sections root.
// Where the TV is sent is a separate question, and `browseDrive` answers it —
// splitting the two is what lets a channels entry name its rail without
// pointing the TV at a rail-grid page it does not have.
export function browseRestore(params) {
  var p = params || {};
  var tab = p.tab || null;
  var rail = p.rail || null;
  if (rail) return { section: tab, rail: rail, level: 'grid' };
  if (tab) return { section: tab, rail: null, level: 'rails' };
  return { section: null, rail: null, level: 'sections' };
}

// The id a channel's tile carries — what the TV's card-route table is handed on
// a tap, and what the phone's trail records as the tile it tuned in from.
export function channelTileId(channelId) {
  return 'channel:' + channelId;
}

// BUG-632 — the rail a channel was tuned in from: the recorded Channels entry
// whose tapped tile is the channel now playing. A channel reached any other way
// — the Guide, the TV changing channel, a rail tapped for a different channel —
// has none, and its crumb stays Home › <channel> › <what's on> (story 7).
// `entries` is the trail as core/nav-trail.js entries() serves it — always an
// array, so there is no absent case to guard (railEntry beside it takes the
// same contract).
export function channelRailEntry(entries, channelId) {
  return entries.filter(function(e) {
    return e.page === 'browse.html' && (e.params || {}).tab === CHANNELS_TAB.id && e.focusedId === channelTileId(channelId);
  }).slice(-1)[0];
}

// BUG-632 — the channel's own crumb, re-pointed at the rail it was tuned in from
// so that pressing it lands back on that rail. The TV's target names the tab
// alone, which a phone's recorded { tab, rail } entry never matches — the trim
// that followed cleared the trail and browse reopened somewhere else.
export function channelSourceCrumb(rail, source) {
  if (!rail || !source) return source;
  return { label: source.label, page: rail.page, params: rail.params };
}

// BUG-632 — where the TV goes when a channel player's crumb is pressed on the
// phone. A Channels target carrying a rail goes out through browseDrive, so it
// never reaches the TV as a rail-grid page; Home passes through untouched.
export function channelCrumbDrive(page, params) {
  var p = params || {};
  if (p.tab === CHANNELS_TAB.id) return browseDrive(p);
  return { page: page, params: p };
}

// BUG-632 — where the TV goes for a crumb pressed on the phone's player page:
// a channel's through channelCrumbDrive, every other rail's exactly as built.
export function playerCrumbDrive(channel, page, params) {
  if (!channel) return { page: page, params: params };
  return channelCrumbDrive(page, params);
}

// TASK-626 — where the TV goes for the same recorded entry. Every other section
// has a `rail-grid.html` holding a rail's items, so a recorded rail names a
// page; Channels does not, and sending the TV there lands it on "Nothing here
// yet" (TASK-564 fixed exactly that). So the channels tab answers its browse
// tab whatever rail the phone is on — the TV's tab draws every rail at once, so
// the two surfaces are still on the same content by their own routes.
export function browseDrive(params) {
  var p = params || {};
  var tab = p.tab || null;
  if (tab === CHANNELS_TAB.id) return { page: 'browse.html', params: { tab: tab } };
  if (p.rail) return { page: 'rail-grid.html', params: { section: tab, rail: p.rail } };
  return { page: 'browse.html', params: { tab: tab } };
}
