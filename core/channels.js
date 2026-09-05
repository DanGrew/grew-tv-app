// Channels (FEAT-560/TASK-563) — the pure model behind the Channels tab: what
// each channel's card says, and whether the tab exists at all. DOM lives in
// ui/screens/screen-browse.js and components/tile.js; this file is the logic,
// so "the card reads right in every state" is provable without a browser.
//
// Fed by GET /api/channels?profile= (grew-tv api/channels.py), one on-now line
// per channel this profile may see:
//   { channel_id, name, item_type, on_air, item, offset_seconds,
//     runtime_seconds, next_on_air }
// `item` is a resolved catalog entry, a minimal { item_id } for an id the
// catalog no longer knows, or null when nothing is on.
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

// The one rail on that tab. Not a catalog rail — a small fixed strip that needs
// no paging (decision 17), which is why FEAT-547 doesn't gate this.
export var CHANNELS_RAIL = 'channels';
var RAIL_TITLE = 'On now';

var OFF_AIR = 'Off air';

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

export function returnTimeLabel(nextOnAir) {
  var stamp = RETURN_AT.exec(String(nextOnAir));
  return stamp ? 'Back at ' + stamp[1] : null;
}

// What the item on air is called. An id the catalog no longer knows still draws
// a card naming the id (api/channels.py resolves it to a minimal entry on
// purpose — a six-month programme outlives the library under it), so a removed
// item leaves a readable gap rather than a blank tile.
export function itemTitle(item) {
  if (!item) return '';
  return item.title || item.item_id || '';
}

// One channel's card, fully resolved for render. Three states, never more:
//
//   on air        — what's playing, `2m/8m`, and a bar that fills
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
    return { onAir: false, name: line.name || '', title: OFF_AIR,
             time: returnTimeLabel(line.next_on_air), percent: 0, poster: null };
  }
  return {
    onAir: true,
    name: line.name || '',
    title: itemTitle(line.item),
    time: positionLabel(offset, line.runtime_seconds),
    percent: channelPercent(offset, line.runtime_seconds),
    poster: (line.item || {}).poster || null
  };
}

// A channel as an action tile. `navParams` carries what opening it needs and
// nothing more — the player asks the endpoint itself for where the channel has
// got to, so a stale offset can never be handed to it through a URL.
export function channelTile(line) {
  return {
    kind: CHANNEL_KIND,
    id: 'channel:' + line.channel_id,
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

// The Channels tab's rails: one strip, or none at all.
export function channelRails(lines) {
  var tiles = channelTiles(lines);
  return tiles.length ? [{ id: CHANNELS_RAIL, title: RAIL_TITLE, items: tiles }] : [];
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
// it is a browse TAB on the TV, with no rail-grid behind it), so its entry
// names the tab alone; restoring that literally left the phone on the rail
// level, showing the pager's dots over no title and no cards.
//
// The tab is enough to name the rail back, because the section has exactly one.
// Every other entry restores as it always did: a rail means the grid, a tab
// alone means that section's rails, neither means the sections root.
export function browseRestore(params) {
  var p = params || {};
  var tab = p.tab || null;
  var rail = p.rail || null;
  if (tab === CHANNELS_TAB.id) return { section: tab, rail: CHANNELS_RAIL, level: 'grid' };
  if (rail) return { section: tab, rail: rail, level: 'grid' };
  if (tab) return { section: tab, rail: null, level: 'rails' };
  return { section: null, rail: null, level: 'sections' };
}
