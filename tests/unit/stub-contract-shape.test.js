// TASK-326 (SYS-017) — Stub ⇄ backend-contract SHAPE conformance.
//
// TASK-311's contract-conformance test guards `contract → core readers` (a renamed
// backend field makes a reader read `undefined`). But the e2e stub
// (tests/fixtures/api.js installApi) is hand-authored and was NEVER checked against
// the contract: someone could edit the stub to emit `durationSecs` instead of
// `duration`, a renamed nested key, or a dropped field, and BOTH suites would stay
// green while the fake drifts off the real backend shape — the SYS-017 failure mode,
// one layer over.
//
// This test closes that gap. For each contract route TASK-310 froze (browse /
// continue-watching / video / album / playlist) it compares the KEY-SET / nesting of
// the objects installApi emits — via the pure `*Response()` builders the route
// handlers delegate to — against the same-route contract fixture, RECURSIVELY,
// ignoring values (content differs by design: the stub is a rich 13-video e2e
// dataset, the contract a thin 1-of-each shape specimen). A renamed/added/dropped
// field on either side makes the key-sets diverge → red.
//
// Legitimate shape gaps are excused per-KEY with a one-line reason (opt-out by
// exception, per WAYS "quality gates" — never a blanket ignore): the stub carries
// app-only scaffolding the backend lacks, and the contract carries backend fields
// the stub doesn't populate. A rename still fires, because it moves a SHARED key
// (unexcused) out of alignment on both sides.
//
// The contract fixtures live in the PRIVATE grew-tv, sparse-checked-out into the
// gitignored tests/.contract/. When that dir is ABSENT (local `vitest` without the
// checkout) the suite SKIPS — CI is the gate. Populate it locally with:
//   npm run contract:pull
// Runs in the same CI `contract-conformance` job as TASK-311 (no second checkout).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  browseResponse, videoResponse, albumResponse, playlistResponse,
  continueWatchingResponse, midWatchRows, MUSIC_CARDS, PLAYLIST_CARDS, PLAYLISTS
} = require('../fixtures/api.js');

const CONTRACT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.contract');
const HAS_CONTRACT = fs.existsSync(CONTRACT_DIR);

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, name + '.json'), 'utf8'));
}

const keysOf = o => Object.keys(o).sort();

// Compare a stub-emitted object's key-set against the same-route contract object's,
// ignoring VALUES. `stubOnly` / `contractOnly` are { key: reason } maps of the
// intentionally-asymmetric keys. Any key present on one side but not the other and
// NOT excused → fail. A stale exclusion (an excused key that no longer exists on its
// side) also fails, so the lists can't silently rot into over-permissiveness.
function expectShape(label, stub, contract, opts) {
  const o = opts || {};
  const stubOnly = o.stubOnly || {};
  const contractOnly = o.contractOnly || {};
  const sk = keysOf(stub);
  const ck = keysOf(contract);

  Object.keys(stubOnly).forEach(k =>
    expect(sk, `${label}: stale stubOnly exclusion '${k}' — ${stubOnly[k]}`).toContain(k));
  Object.keys(contractOnly).forEach(k =>
    expect(ck, `${label}: stale contractOnly exclusion '${k}' — ${contractOnly[k]}`).toContain(k));

  const unexcusedStub = sk.filter(k => !ck.includes(k)).filter(k => !(k in stubOnly));
  const unexcusedContract = ck.filter(k => !sk.includes(k)).filter(k => !(k in contractOnly));
  expect(unexcusedStub, `${label}: stub emits key(s) the contract lacks (rename/typo/scaffolding?)`).toEqual([]);
  expect(unexcusedContract, `${label}: contract carries key(s) the stub dropped (rename/missing field?)`).toEqual([]);
}

// A stub audio-track video record (album/playlist member). Same divergence whether
// reached through /api/album or /api/playlist, so both routes reuse this.
const AUDIO_VIDEO = {
  stubOnly: {
    mediaType: 'stub scaffolding — app is type-agnostic (reads neither mediaType nor itemType); marks the fixture <audio> path only'
  },
  contractOnly: {
    endAt: 'backend trim point; the stub track is untrimmed',
    genres: 'backend genre list; stub omits it on track records',
    itemType: 'backend classifier; app is type-agnostic and never reads itemType',
    lyrics: 'backend lyrics ref; this stub track carries none',
    people: 'backend people list; stub omits it on track records',
    startAt: 'backend trim point; the stub track is untrimmed',
    tags: 'backend tags map; stub omits it on track records',
    type: 'backend genre-type; an audio track has none in the stub'
  }
};

describe.skipIf(!HAS_CONTRACT)('stub ⇄ backend contract shape (SYS-017 / TASK-326)', () => {
  let browse, cw, video, album, playlist;
  beforeAll(() => {
    browse = load('browse');
    cw = load('continue-watching');
    video = load('video');
    album = load('album');
    playlist = load('playlist');
  });

  describe('/api/browse (browseResponse)', () => {
    it('envelope shape matches (profile / genreLabels / content)', () => {
      expectShape('browse envelope', browseResponse('kids'), browse);
    });

    it('a video card matches the contract video card', () => {
      const stub = browseResponse('kids').content.find(c => c.kind === 'video');
      const con = browse.content.find(c => c.kind === 'video');
      expectShape('browse video card', stub, con, {
        contractOnly: {
          artist: 'backend sends artist:null on video cards; stub omits it',
          itemType: 'backend classifier; app is type-agnostic, never reads itemType',
          subtitles: 'backend echoes subtitles on the card; stub keeps it on the video record only'
        }
      });
    });

    it('a series card matches the contract series card', () => {
      const stub = browseResponse('kids').content.find(c => c.kind === 'series');
      const con = browse.content.find(c => c.kind === 'series' && c.collectionType === 'series');
      expectShape('browse series card', stub, con, {
        contractOnly: {
          artist: 'backend field, null for a series; stub omits it',
          clipCount: 'backend episode count; stub series card omits it (detail derives count from items)',
          collectionType: 'backend discriminator; stub series card routes by kind/section',
          hasCC: 'backend caption badge flag; stub series card omits it',
          hasLyrics: 'backend lyrics badge flag; stub series card omits it',
          tags: 'backend tags map; stub series card omits it'
        }
      });
    });

    // Album/playlist browse cards are injected by the music/playlist e2e through a
    // /api/browse override (kept out of the default kids browse), so they are part of
    // the browse route's emitted vocabulary — bind their shape too.
    it('an album card (MUSIC_CARDS) matches the contract album card', () => {
      const con = browse.content.find(c => c.collectionType === 'album');
      expectShape('browse album card', MUSIC_CARDS[0], con, {
        contractOnly: {
          collectionType: 'backend discriminator; stub album card routes by section:music',
          genres: 'backend genre list; stub album card omits it',
          hasCC: 'backend caption badge flag; stub album card omits it',
          people: 'backend people list; stub album card omits it'
        }
      });
    });

    it('a playlist card (PLAYLIST_CARDS) matches the contract playlist card', () => {
      const con = browse.content.find(c => c.collectionType === 'playlist');
      expectShape('browse playlist card', PLAYLIST_CARDS[0], con, {
        contractOnly: {
          genres: 'backend genre list; stub playlist card omits it',
          hasCC: 'backend caption badge flag; stub playlist card omits it',
          hasLyrics: 'backend lyrics badge flag; stub playlist card omits it',
          people: 'backend people list; stub playlist card omits it'
        }
      });
    });
  });

  describe('/api/continue-watching (continueWatchingResponse)', () => {
    // Seed one mid-watch row so midWatchRows emits a row shape to bind (the default
    // store is empty). position < duration keeps it in the CW set.
    const store = { 'toy-story-main': { item_id: 'toy-story-main', position_secs: 100, duration_secs: 4860, last_watched: 5 } };

    it('envelope shape matches (person / content / recents)', () => {
      expectShape('continue-watching envelope', continueWatchingResponse('kids', store), cw);
    });

    it('a CW row matches the contract row', () => {
      const row = midWatchRows(store)[0];
      expectShape('continue-watching row', row, cw.content[0], {
        contractOnly: {
          itemType: 'backend classifier; app is type-agnostic, never reads itemType'
        }
      });
    });

    it('recents is an array (the default stub emits it empty — element shape is supplied by per-test overrides, not installApi)', () => {
      // installApi's default continue-watching emits `recents: []`, so there is no
      // stub recents ELEMENT to shape-bind here; the contract's recents element shape
      // (last_played/source_id/source_type) is exercised reader-side by TASK-311.
      expect(Array.isArray(continueWatchingResponse('kids', store).recents)).toBe(true);
      expect(cw.recents.length).toBeGreaterThan(0);
    });
  });

  describe('/api/video (videoResponse)', () => {
    it('a film video record matches the contract video', () => {
      expectShape('video (film)', videoResponse('toy-story-main'), video, {
        stubOnly: {
          format: 'stub scaffolding — app is type-agnostic (reads neither format nor mediaType); drives fixture routing only'
        },
        contractOnly: {
          artist: 'backend field, null for a film; stub omits it on the video record',
          endAt: 'backend trim point; the stub emits no trimmed videos',
          ext: 'backend always sends ext; stub films default to mp4 and omit it (audio tracks carry it)',
          genres: 'backend genre list; stub keeps genres on browse cards, not on the video record',
          itemType: 'backend classifier; app is type-agnostic, never reads itemType',
          lyrics: 'backend lyrics ref; stub films carry none (audio tracks set it)',
          people: 'backend people list; stub omits it on the video record',
          startAt: 'backend trim point; the stub emits no trimmed videos'
        }
      });
    });
  });

  describe('/api/album (albumResponse)', () => {
    it('album envelope shape matches', () => {
      expectShape('album envelope', albumResponse('ootb'), album, {
        stubOnly: {
          format: 'stub scaffolding — app is type-agnostic, never reads format'
        },
        contractOnly: {
          collectionType: 'backend discriminator; a stub album is reached via /api/album so the field is unused here',
          genres: 'backend genre list; stub album omits it',
          people: 'backend people list; stub album omits it',
          seasons: 'backend sends seasons:[] on an album; stub album omits it (album detail shows no season chips)',
          tags: 'backend tags map; stub album omits it',
          type: 'backend genre-type; stub album omits it'
        }
      });
    });

    it('an album item envelope matches (season / episode / video)', () => {
      expectShape('album item', albumResponse('ootb').items[0], album.items[0], {
        contractOnly: {
          season: 'backend sends season:null on album items; stub album items carry only episode'
        }
      });
    });

    it('an album member video record matches the contract track video', () => {
      expectShape('album item video', albumResponse('ootb').items[0].video, album.items[0].video, AUDIO_VIDEO);
    });
  });

  describe('/api/playlist (playlistResponse)', () => {
    it('playlist envelope shape matches', () => {
      expectShape('playlist envelope', playlistResponse(PLAYLISTS, 'pl-roadtrip'), playlist, {
        contractOnly: {
          artist: 'backend field, null for a playlist; stub playlist omits it',
          genres: 'backend genre list; stub playlist omits it',
          people: 'backend people list; stub playlist omits it',
          tags: 'backend tags map; stub playlist omits it',
          type: 'backend genre-type; stub playlist omits it'
        }
      });
    });

    it('a playlist item envelope matches (season / episode / video)', () => {
      const stub = playlistResponse(PLAYLISTS, 'pl-roadtrip');
      expectShape('playlist item', stub.items[0], playlist.items[0]);
    });

    it('a playlist member video record matches the contract track video', () => {
      const stub = playlistResponse(PLAYLISTS, 'pl-roadtrip');
      expectShape('playlist item video', stub.items[0].video, playlist.items[0].video, AUDIO_VIDEO);
    });
  });
});
