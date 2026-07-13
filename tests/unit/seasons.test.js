import { describe, it, expect } from 'vitest';
import {
  seasonsOf, hasSeasonChips, seasonLabel, chipClass, visibleItems,
  episodeCount, defaultSeason, seasonPosterOf, posterCandidates
} from '../../core/seasons.js';

function item(id, season) { return { season: season, video: { id: id, duration: 600 } }; }
var ITEMS = [item('s1e1', 1), item('s1e2', 1), item('s2e1', 2)];
var SEASONS = [{ season: 1, poster: 's1.jpg' }, { season: 2, poster: 's2.jpg' }];

describe('seasonsOf', () => {
  it('returns the declared seasons', () => {
    expect(seasonsOf({ seasons: SEASONS })).toBe(SEASONS);
  });
  it('is [] when absent or series is null', () => {
    expect(seasonsOf({})).toEqual([]);
    expect(seasonsOf(null)).toEqual([]);
  });
});

describe('hasSeasonChips', () => {
  it('true only when at least one season is declared', () => {
    expect(hasSeasonChips({ seasons: SEASONS })).toBe(true);
    expect(hasSeasonChips({ seasons: [] })).toBe(false);
    expect(hasSeasonChips({})).toBe(false);
  });
});

describe('seasonLabel', () => {
  it('labels a season', () => {
    expect(seasonLabel(2)).toBe('Season 2');
  });
});

describe('chipClass', () => {
  it('adds active for the selected season only', () => {
    expect(chipClass(2, 2)).toBe('season-chip active');
    expect(chipClass(1, 2)).toBe('season-chip');
  });
});

describe('visibleItems', () => {
  it('keeps every item with its original index when season is null', () => {
    expect(visibleItems(ITEMS, null).map(function(e) { return e.idx; })).toEqual([0, 1, 2]);
  });
  it('filters to one season but preserves original indices', () => {
    var v = visibleItems(ITEMS, 2);
    expect(v).toHaveLength(1);
    expect(v[0].idx).toBe(2);
    expect(v[0].item.video.id).toBe('s2e1');
  });
  it('tolerates missing items', () => {
    expect(visibleItems(null, 1)).toEqual([]);
  });
  it('missing items with the no-chip (null season) path is still empty', () => {
    expect(visibleItems(null, null)).toEqual([]);
  });
});

describe('episodeCount', () => {
  it('counts items in a season', () => {
    expect(episodeCount(ITEMS, 1)).toBe(2);
    expect(episodeCount(ITEMS, 2)).toBe(1);
  });
});

describe('defaultSeason', () => {
  it('is null when no seasons are declared', () => {
    expect(defaultSeason(ITEMS, {}, [])).toBe(null);
  });
  it('is the Play-next item season (first item, no progress)', () => {
    expect(defaultSeason(ITEMS, {}, SEASONS)).toBe(1);
  });
  it('follows the most-recently-played episode into its season', () => {
    var progress = { 's1e2': { resumePositionSec: 10, lastPlayed: 5000 } };
    // last-played s1e2 is finished-enough -> next is s2e1 (season 2).
    var done = { 's1e2': { resumePositionSec: 600, lastPlayed: 5000 } };
    expect(defaultSeason(ITEMS, done, SEASONS)).toBe(2);
    // mid-watch s1e2 -> continue it (season 1).
    expect(defaultSeason(ITEMS, progress, SEASONS)).toBe(1);
  });
  it('falls back to the first declared season when the item has no season', () => {
    expect(defaultSeason([{ video: { id: 'x' } }], {}, SEASONS)).toBe(1);
  });
  it('tolerates missing items — falls back to the first declared season', () => {
    expect(defaultSeason(null, {}, SEASONS)).toBe(1);
  });
});

describe('seasonPosterOf', () => {
  it('finds a season poster', () => {
    expect(seasonPosterOf(SEASONS, 2)).toBe('s2.jpg');
  });
  it('is null for an unknown or null season', () => {
    expect(seasonPosterOf(SEASONS, 9)).toBe(null);
    expect(seasonPosterOf(SEASONS, null)).toBe(null);
    expect(seasonPosterOf([], 1)).toBe(null);
    expect(seasonPosterOf(null, 1)).toBe(null);
  });
});

describe('posterCandidates', () => {
  it('season art first, then series art', () => {
    expect(posterCandidates('http://s', 's2.jpg', 'show.jpg'))
      .toEqual(['http://s/media/s2.jpg', 'http://s/media/show.jpg']);
  });
  it('drops absent posters', () => {
    expect(posterCandidates('http://s', null, 'show.jpg')).toEqual(['http://s/media/show.jpg']);
    expect(posterCandidates('http://s', null, null)).toEqual([]);
  });
});
