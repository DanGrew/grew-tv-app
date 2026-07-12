// FEAT-048 (TASK-324) — the search overlay's pure core: build the searchable
// item lists (Videos from browse cards; Music = tracks from /api/tracks plus
// albums & artists derived from the same cards), rank a query against them, and
// render the flat result rows. DOM-free so the two surfaces (TV app + companion)
// share one ranking + one markup and can never drift. The overlay is a SEPARATE
// surface — it never touches the browse drill (BUG-038), it just reads its cards.
//
// A result item is { title, poster, secondary, tag, card, fields }:
//   - title/poster/secondary/tag  — what the row renders.
//   - card    — the object the surface hands to its EXISTING select handler, so
//               routing reuses cardRoute (a TRACK's card targets its album, an
//               ALBUM its detail, an ARTIST its artist page, a video plays/opens).
//   - fields  — the ranked strings in priority order (Videos: title; Music:
//               title -> album -> artist), consumed only by rankSearch.

import { mediaUrl } from './app-api.js';
import { artistTiles } from './home-rails.js';

function sectionOf(card) { return card.section || 'films'; }

function titleCaseWord(slug) {
  return String(slug).split('-')
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}

// Videos: FILM / SERIES / HOME. Home Movies win over the kind (a home-movies
// collection is kind:'series' but tags HOME); a non-home series is SERIES; the
// rest (standalone videos) are FILM.
function videoTag(card) {
  if (sectionOf(card) === 'home-movies') return 'HOME';
  if (card.kind === 'series') return 'SERIES';
  return 'FILM';
}

// Videos secondary = genre / year: the first genre (title-cased) when present,
// else the release year, else nothing.
function videoSecondary(card) {
  var genre = (Array.isArray(card.genres) && card.genres.length) ? titleCaseWord(card.genres[0]) : '';
  var year = (card.tags && card.tags.year) ? String(card.tags.year) : '';
  return [genre, year].filter(Boolean)[0] || '';
}

// Every non-music browse card is a Video search item, ranked on its title.
export function videoItems(cards) {
  return (cards || [])
    .filter(function(c) { return sectionOf(c) !== 'music'; })
    .map(function(c) {
      return {
        title: c.title || '', poster: c.poster || null,
        secondary: videoSecondary(c), tag: videoTag(c),
        card: c, fields: [c.title || '']
      };
    });
}

// A track (from /api/tracks) routes to ITS album AND starts playing: the card is
// kind:'track' (cardRoute -> 'track'), carrying the track id + its album_id, so
// each surface opens audio.html?album=<album_id>&track=<track_id> — the album's
// player started on this song. Ranked title -> album -> artist so an artist/album
// name still surfaces its tracks.
function trackItems(tracks) {
  return (tracks || []).map(function(t) {
    return {
      title: t.title || '', poster: t.cover || null,
      secondary: [t.artist, t.album].filter(Boolean).join(' · '), tag: 'TRACK',
      card: { kind: 'track', id: t.id, album: t.album_id },
      fields: [t.title || '', t.album || '', t.artist || '']
    };
  });
}

// Album search items = the Music browse cards that are real albums (not
// playlists, not synthesized artist tiles). The card IS the browse card, so a
// tap routes to album detail. Ranked title -> artist.
function albumItems(cards) {
  return (cards || [])
    .filter(function(c) { return sectionOf(c) === 'music' && c.collectionType !== 'playlist' && c.kind !== 'artist'; })
    .map(function(c) {
      return {
        title: c.title || '', poster: c.poster || null,
        secondary: c.artist || '', tag: 'ALBUM',
        card: c, fields: [c.title || '', c.artist || '']
      };
    });
}

// Artist search items reuse the SAME synthesized artist tiles the Music browse
// rail builds (core/home-rails artistTiles) — one per distinct album artist,
// carrying kind:'artist' so cardRoute -> 'artist' opens the artist page. Ranked
// on the artist name.
function artistItems(cards) {
  // artistTiles always supplies title (the artist name), poster (or null) and a
  // subLabel ("N albums"), so no fallbacks are needed here.
  return artistTiles(cards || []).map(function(t) {
    return { title: t.title, poster: t.poster, secondary: t.subLabel, tag: 'ARTIST', card: t, fields: [t.title] };
  });
}

// The Music search set: tracks (index route) + albums + artists, all mixed and
// ranked together so one query surfaces every matching type.
export function musicItems(tracks, cards) {
  return trackItems(tracks).concat(albumItems(cards)).concat(artistItems(cards));
}

// One field's match quality against the (already-lowercased) query:
// exact 3 > prefix 2 > substring 1 > none 0. Case-insensitive.
function scoreField(field, q) {
  var f = String(field == null ? '' : field).toLowerCase();
  if (!f) return 0;
  if (f === q) return 3;
  if (f.indexOf(q) === 0) return 2;
  if (f.indexOf(q) >= 0) return 1;
  return 0;
}

// An item's score = its best field match; `pri` = the highest-priority (lowest
// index) field that achieved it, so field priority breaks quality ties.
function scoreItem(item, q) {
  var scores = (item.fields || []).map(function(f) { return scoreField(f, q); });
  var best = scores.reduce(function(a, b) { return Math.max(a, b); }, 0);
  return { item: item, score: best, pri: scores.indexOf(best) };
}

// Closest match first: higher score, then higher-priority matching field, then
// A-Z title.
function compareScored(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  if (a.pri !== b.pri) return a.pri - b.pri;
  return String(a.item.title).toLowerCase().localeCompare(String(b.item.title).toLowerCase());
}

// Rank items against a query: non-matches excluded, closest match first. An
// empty/blank query yields nothing (the overlay shows results only from >=1 char).
export function rankSearch(query, items) {
  var q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return (items || [])
    .map(function(it) { return scoreItem(it, q); })
    .filter(function(s) { return s.score > 0; })
    .sort(compareScored)
    .map(function(s) { return s.item; });
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The thumbnail cell: a lazy <img> (only visible rows fetch art — a bounded,
// intentional departure from the text-only browse grid) when the item has a
// poster, else an empty placeholder cell.
function thumbHtml(poster, serverUrl) {
  var url = mediaUrl(serverUrl, poster);
  if (!url) return '<span class="sr-thumb sr-thumb-empty"></span>';
  return '<img class="sr-thumb" loading="lazy" src="' + escapeHtml(url) + '" alt="">';
}

// One result row: thumbnail · (title + secondary) · right-aligned type tag. The
// data-i index is the tap target the surface maps back to the ranked item.
function rowHtml(item, i, serverUrl) {
  return '<button type="button" class="sr-row" data-i="' + i + '">' +
    thumbHtml(item.poster, serverUrl) +
    '<span class="sr-main">' +
    '<span class="sr-title">' + escapeHtml(item.title) + '</span>' +
    '<span class="sr-sub">' + escapeHtml(item.secondary) + '</span>' +
    '</span>' +
    '<span class="sr-tag">' + escapeHtml(item.tag) + '</span>' +
    '</button>';
}

// The full ranked result list as one HTML string the overlay mounts.
export function searchResultsHtml(items, serverUrl) {
  return (items || []).map(function(it, i) { return rowHtml(it, i, serverUrl); }).join('');
}
