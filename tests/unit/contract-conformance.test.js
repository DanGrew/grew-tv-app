// TASK-311 (SYS-017) — App ⇄ backend response-shape conformance.
//
// The app hand-stubs the media-manager in tests/fixtures/api.js. Nothing stopped
// that stub — or the app's readers — from drifting off the backend's REAL response
// shape: a handler renames a field, both suites stay green, prod breaks. TASK-310
// froze the backend's wire shape into committed fixtures
// (grew-tv media-manager/tests/contract/*.json). This test feeds those REAL
// fixtures through the app's own core/ readers and asserts each reader consumes the
// field it depends on — a renamed/removed backend field makes the reader read
// `undefined`, changing the derived output, and this test goes red.
//
// The fixtures live in grew-tv (a private repo), sparse-checked-out by CI into the
// gitignored tests/.contract/. When that dir is ABSENT (local `vitest` run without
// the checkout) the suite SKIPS — CI is the gate. Populate it locally with:
//   npm run contract:pull
// See CLAUDE.md → "Tests" and .github/workflows/test.yml (contract-conformance job).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTabs, buildTabRails, cardRoute } from '../../core/home-rails.js';
import { tileModel } from '../../core/tile-model.js';
import { progressMapFromCW } from '../../core/progress.js';
import { collectionMetaLine, episodeLabel } from '../../core/detail-view.js';
import { primaryAction } from '../../core/series-detail.js';
import { progressPct } from '../../core/player-math.js';

const CONTRACT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.contract');
const HAS_CONTRACT = fs.existsSync(CONTRACT_DIR);

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, name + '.json'), 'utf8'));
}

function findItem(rails, id) {
  return rails.flatMap(r => r.items).find(i => i.id === id);
}

// The fields the app's readers pull off an /api/video record. startAt/endAt/lyrics
// are read by the audio page (screen-audio-page.js loadVideo → beginPlayback /
// loadTrackLyrics); duration/subtitles/type/ext/poster by the video player. A value
// of null is legitimate (untrimmed track), so a rename can't be caught by output —
// key PRESENCE is the drift signal for these.
const VIDEO_READER_FIELDS = ['id', 'title', 'ext', 'duration', 'subtitles', 'startAt', 'endAt', 'lyrics', 'available', 'poster', 'type'];

describe.skipIf(!HAS_CONTRACT)('backend contract conformance (SYS-017 / TASK-311)', () => {
  let browse, cw, video, album, playlist;
  beforeAll(() => {
    browse = load('browse');
    cw = load('continue-watching');
    video = load('video');
    album = load('album');
    playlist = load('playlist');
  });

  describe('/api/browse → core/home-rails + core/tile-model', () => {
    it('buildTabs surfaces every content section (proves `section`)', () => {
      // A dropped/renamed `section` collapses every card to the Films fallback, so
      // the tab set shrinks — this is the drift signal.
      expect(buildTabs(browse.content).map(t => t.id)).toEqual(['series', 'films', 'home-movies', 'music']);
    });

    it('a film rail carries the card duration (proves `duration`)', () => {
      const rails = buildTabRails('films', browse.content, [], browse.genreLabels, []);
      const toy = findItem(rails, 'toy-story-main');
      expect(toy).toBeDefined();
      expect(toy.durationSec).toBe(4800); // withDurationSec maps `duration`→durationSec
    });

    it('an album tile derives music/lyrics/count fields (proves `section`,`hasLyrics`,`clipCount`)', () => {
      const albumCard = browse.content.find(c => c.id === 'album-foo');
      const tile = tileModel(albumCard, {});
      expect(tile.music).toBe(true);        // section === 'music'
      expect(tile.showLyrics).toBe(true);   // hasLyrics
      expect(tile.sub).toBe('2 tracks');    // clipCount === 2
    });

    it('cardRoute routes on collectionType/section (proves `collectionType`)', () => {
      expect(cardRoute(browse.content.find(c => c.id === 'road-trip'))).toBe('playlist');
      expect(cardRoute(browse.content.find(c => c.id === 'album-foo'))).toBe('album');
    });

    it('the Music tab builds an Artists rail (proves `artist`)', () => {
      const rails = buildTabRails('music', browse.content, [], browse.genreLabels, []);
      const artists = rails.find(r => r.id === 'artists');
      expect(artists).toBeDefined();
      expect(artists.items.map(t => t.title)).toContain('Foo');
    });
  });

  describe('/api/continue-watching → core/progress + core/home-rails', () => {
    it('progressMapFromCW reads the resume fields (proves `item_id`,`position_secs`,`last_watched`)', () => {
      const map = progressMapFromCW(cw.content);
      expect(map['m-walk'].resumePositionSec).toBe(40);   // position_secs
      expect(map['m-walk'].lastPlayed).toBeTruthy();       // last_watched
      expect(map['ollie-park'].resumePositionSec).toBe(20);
    });

    it('a standalone CW row joins its browse card (proves `duration_secs`,`item_id`)', () => {
      const rails = buildTabRails('home-movies', browse.content, cw.content, {}, []);
      const cont = rails.find(r => r.id === 'continue');
      const row = cont.items.find(i => i.id === 'ollie-park');
      expect(row).toBeDefined();
      expect(row.durationSec).toBe(45); // duration_secs
    });

    it('an episode CW row joins its collection (proves `collection_id`,`collection_title`)', () => {
      const rails = buildTabRails('series', browse.content, cw.content, {}, []);
      const cont = rails.find(r => r.id === 'continue');
      const row = cont.items.find(i => i.id === 'm-walk');
      expect(row).toBeDefined();
      expect(row.title).toContain('Millie'); // collection_title prefixes the label
    });

    it('the Recently Played rail resolves its sources (proves `recents[].source_id`)', () => {
      const rails = buildTabRails('music', browse.content, [], browse.genreLabels, cw.recents);
      const recent = rails.find(r => r.id === 'recent');
      expect(recent).toBeDefined();
      expect(recent.items).toHaveLength(2); // 'Foo' (artist) + 'album-foo' (album)
    });
  });

  describe('/api/video → core/player-math + reader-field shape', () => {
    it('the video duration drives progress arithmetic (proves `duration`)', () => {
      expect(progressPct(2400, video.duration)).toBe(50);
    });

    it('carries every field the player/audio readers pull (proves reader shape)', () => {
      expect(Object.keys(video)).toEqual(expect.arrayContaining(VIDEO_READER_FIELDS));
    });
  });

  describe('/api/album → core/detail-view + core/series-detail', () => {
    it('collectionMetaLine counts the items (proves `items`)', () => {
      expect(collectionMetaLine(album)).toBe('2 clips');
    });

    it('episodeLabel reads the member video title (proves `items[].video.title`)', () => {
      expect(episodeLabel(album.items[0])).toBe('Foo Track One');
    });

    it('primaryAction reads the member id + duration (proves `items[].video.id`,`.duration`)', () => {
      // A rename of items[].video.id makes the progress lookup miss → not mid-watch
      // → 'next' instead of 'continue'.
      expect(primaryAction(album.items, { 'track-foo-01': { resumePositionSec: 100, lastPlayed: 5 } }).kind).toBe('continue');
      // A FINISHED first member (resume === its 210s duration) must read as done →
      // 'next', not 'continue'. A renamed .duration makes isFinished(210, undefined)
      // false → the member reads mid-watch → 'continue', flipping this red.
      expect(primaryAction(album.items, { 'track-foo-01': { resumePositionSec: 210, lastPlayed: 5 } }).kind).toBe('next');
    });
  });

  describe('/api/playlist → core/detail-view + core/series-detail', () => {
    it('collectionMetaLine counts the items (proves `items`)', () => {
      expect(collectionMetaLine(playlist)).toBe('3 clips');
    });

    it('episodeLabel reads the member video title (proves `items[].video.title`)', () => {
      expect(episodeLabel(playlist.items[0])).toBe('Foo Track One');
    });

    it('primaryAction reads the member id + duration (proves `items[].video.id`,`.duration`)', () => {
      expect(primaryAction(playlist.items, { 'track-foo-01': { resumePositionSec: 100, lastPlayed: 5 } }).kind).toBe('continue');
      // track-foo-01 recurs as the playlist's LAST member, so a finished resume
      // wraps to 'again' (still ≠ 'continue' — a renamed .duration would flip it).
      expect(primaryAction(playlist.items, { 'track-foo-01': { resumePositionSec: 210, lastPlayed: 5 } }).kind).toBe('again');
    });
  });
});
