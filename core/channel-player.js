// Channel PLAYER (FEAT-560/TASK-564) — the pure model behind watching a
// channel: where the channel has got to versus where the viewer is, what the
// schedule plays next, and which channel the rocker lands on.
//
// The strip's own model is core/channels.js and stays there; this is the half
// the player needs, and it reuses that module rather than re-deriving anything
// (`tickedOffset` is the clock both surfaces run on, `itemTitle` the one way an
// item the catalog has forgotten still reads).
//
// Fed by GET /api/channels/{id}?profile= (grew-tv api/channels.py) — the on-now
// line plus what the player needs beyond it:
//   { channel_id, name, item_type, on_air, item, offset_seconds,
//     runtime_seconds, next_on_air, bed, tag, started_at, ends_at, next }
// `next` is the items after the one playing, each { item, tag, starts_at,
// ends_at }.
//
// ⚠️ A CHANNEL IS A CLOCK, NOT A QUEUE (decision 11). Nothing here waits for
// the viewer: the channel's position is derived from the wall clock alone, so
// restarting an item leaves the viewer behind on purpose and finishing it skips
// roughly what they re-watched. There is deliberately no function that pauses,
// rewinds or otherwise moves the channel — the viewer moves, the channel does
// not.

import { tickedOffset, itemTitle } from './channels.js';
import { wrapIndex } from './player-math.js';

// How far behind the channel the viewer may be before they are told about it.
//
// Tuning in seeks to the channel's position, so the two run level from then on
// and the gap stays sub-second — except that a seek lands a moment late and a
// buffering stall costs a second or two more. Under five seconds is that noise,
// and flashing "Back to live" at a viewer who is level is worse than not
// offering it; past five seconds they have actually missed something, which is
// the whole reason the pill exists (story 4).
export var LIVE_TOLERANCE_SECONDS = 5;

// Is the viewer behind the channel? The one question the Back to live pill is
// shown by, and the one that decides whether a finished entry may retune under
// them (below).
//
// Off air answers false: `channelSeconds` is null there, the subtraction is
// NaN, and NaN fails the comparison. A viewer with nothing playing is not
// behind anything, and there is nothing to go back to.
export function isBehindLive(viewerSeconds, channelSeconds) {
  return channelSeconds - viewerSeconds > LIVE_TOLERANCE_SECONDS;
}

// Whether the channel has finished the entry it was airing — the moment its own
// programme rolls on, whether or not the viewer's file has ended.
//
// It is asked of the ENTRY's runtime, not the file's duration, because those
// two differ: an item cut short by the start of an off-air stretch airs less
// than it runs (api/channels.py `_runtime_seconds`). Without this the player
// would sit on a truncated item until its file ended, long after the channel
// moved on.
//
// A missing or nonsensical runtime answers false rather than throwing — the
// same one guard core/channels.js's channelPercent uses, and for the same
// reason: a channel with no runtime still draws, it just never rolls itself.
export function entryFinished(detail, elapsedSeconds) {
  var line = detail || {};
  var runtime = Number(line.runtime_seconds);
  if (!(runtime > 0)) return false;
  return tickedOffset(line, elapsedSeconds) >= runtime;
}

// Whether the player should ask the channel what is on NOW.
//
// ⚠️ `behind` is what makes restart work (decision 11, story 5). The channel
// finishing its entry is not on its own a reason to move the viewer: someone
// who pressed Restart is deliberately behind and gets to finish what they
// restarted. They rejoin when their own item ends — which the player drives off
// the `ended` event, not off this.
export function shouldRetune(detail, elapsedSeconds, behind) {
  return entryFinished(detail, elapsedSeconds) && !behind;
}

// What the SCHEDULE plays next, or null when the answer carries no lookahead.
// Story 6 — up next on a channel is the programme, never a queue, so this is
// the only thing that fills that line in channel mode.
//
// An id the catalog no longer knows still names itself, exactly as it does on
// the strip's card: a six-month programme outlives the library under it, and a
// removed item should read as a gap rather than blank the line.
export function upNextTitle(detail) {
  var schedule = (detail || {}).next;
  if (!schedule) return null;
  var next = schedule[0];
  if (!next) return null;
  var title = itemTitle(next.item);
  if (!title) return null;
  return title;
}

// The record the player loads for what is on air — the same four fields
// core/video-page-config.js's videoRecord pulls off a queue snapshot, off the
// channel answer's own resolved item instead.
//
// Null when there is nothing on. Off air is not an error and not a third state:
// api/channels.py sends `item: null` for a channel between slots, one nobody
// regenerated and one that has run out alike, so one null answers all three.
export function channelRecord(detail) {
  var item = (detail || {}).item;
  if (!item) return null;
  return { id: item.item_id, title: item.title, subtitles: item.subtitles, ext: item.ext };
}

// What the corner ident reads (story 1). Falls back to the channel's id, so a
// channel whose config forgot to name itself is still identifiable on screen
// rather than showing an empty badge.
export function identLabel(detail) {
  var line = detail || {};
  return line.name || line.channel_id || '';
}

// Which channel the volume rocker lands on — `=` up (+1), `-` down (-1),
// wrapping at both ends (decision 15). The handset has no keypad, so flipping
// past the last channel has to arrive somewhere, and the first is the only
// answer that keeps pressing the same button moving.
//
// `ids` is the strip's own order, which is the backend's (api/channels.py sends
// them in id order and the app never re-sorts) — so flipping matches the order
// the cards were in.
//
// A channel that is no longer on the strip lands on the first rather than
// nowhere: the programme moved under this page, and refusing to flip would trap
// the viewer on a channel they can no longer reach the neighbours of.
export function flipTarget(ids, currentId, delta) {
  var list = ids || [];
  if (!list.length) return null;
  var at = list.indexOf(currentId);
  if (at < 0) return list[0];
  return list[wrapIndex(at, delta, list.length)];
}

// The channel ids on the strip, in the order it served them.
export function channelIds(lines) {
  return (lines || []).map(function(line) { return line.channel_id; });
}
