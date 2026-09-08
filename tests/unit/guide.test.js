// TASK-590 (FEAT-560) — the Guide's model.
//
// The fixtures below are a Sunday evening on the adults line-up, drawn from the
// same real channels the design mock was: After Dark on films, Comedy Club on
// 22-minute episodes. That pairing is the whole reason the page lists rather
// than draws a proportional grid, so it is what the tests are written against.
//
// Every stamp here is a NAIVE local wall clock, exactly as the backend writes
// them (grammar call 3) — no zone, no `Z`, and nothing in the module under test
// may parse one to a Date.

import { describe, it, expect } from 'vitest';
import {
  GUIDE_MAX_ROWS,
  dayKey, nextDay, weekday, dayLabel, dayTabs, nowLabel, quietLabel,
  runtimeLabel, guideRow, guideRuns, guideColumn, guideHead, guideTailLine,
  guideMoreLine, todayKey
} from '../../core/guide.js';

function film(id, title, startsAt, endsAt, duration) {
  return {
    kind: 'programme', tag: 'film', starts_at: startsAt, ends_at: endsAt,
    item: { item_id: id, title: title, itemType: 'film', duration: duration, series: null }
  };
}
function episode(id, title, startsAt, endsAt, duration, season, number) {
  return {
    kind: 'programme', tag: 'sitcom', starts_at: startsAt, ends_at: endsAt,
    item: {
      item_id: id, title: title, itemType: 'episode', duration: duration,
      series: { id: 'series-black-books', title: 'Black Books', season: season, episode: number }
    }
  };
}
function offAir(startsAt, nextOnAir) {
  return { kind: 'off_air', starts_at: startsAt, next_on_air: nextOnAir };
}

// After Dark, read at 21:07 on Sunday: Alien is already on (and so absent from
// the listing — the backend walks over the programme playing when the read
// opens), Predator and Minority Report follow, and the channel is then off until
// Monday evening.
const AFTER_DARK = {
  channel_id: 'after-dark', name: 'After Dark', item_type: 'film',
  from: '2026-09-06T21:07:00', to: '2026-09-08T21:07:00',
  entries: [
    film('predator', 'Predator', '2026-09-06T21:55:00', '2026-09-06T23:42:00', 6420),
    film('minority', 'Minority Report', '2026-09-06T23:42:00', '2026-09-07T02:07:00', 8700),
    offAir('2026-09-07T02:07:00', '2026-09-07T20:00:00'),
    film('aliens', 'Aliens', '2026-09-07T20:00:00', '2026-09-07T22:17:00', 8220),
    film('startrek', 'Star Trek', '2026-09-07T22:17:00', '2026-09-08T00:24:00', 7620),
    film('badboys', 'Bad Boys II', '2026-09-08T00:24:00', '2026-09-08T02:51:00', 8820),
    offAir('2026-09-08T02:51:00', '2026-09-08T20:00:00')
  ]
};

const TODAY = '2026-09-06';
const TOMORROW = '2026-09-07';

describe('days, read off a stamp rather than parsed', () => {
  it('reads the date out of a naive stamp', () => {
    expect(dayKey('2026-09-06T21:07:00')).toBe('2026-09-06');
  });

  it('reads no date out of anything that is not one', () => {
    expect(dayKey(null)).toBe(null);
    expect(dayKey('tomorrow')).toBe(null);
    expect(dayKey('21:07')).toBe(null);
  });

  it('steps to the next day, over a month end, a year end and a leap day', () => {
    expect(nextDay('2026-09-06')).toBe('2026-09-07');
    expect(nextDay('2026-09-30')).toBe('2026-10-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });

  it('steps nowhere from something that is not a date', () => {
    expect(nextDay('never')).toBe(null);
  });

  it('names the weekday, and names nothing for a non-date', () => {
    expect(weekday('2026-09-06')).toBe('Sunday');
    expect(weekday('2026-09-07')).toBe('Monday');
    expect(weekday('2026-09-08')).toBe('Tuesday');
    expect(weekday('')).toBe('');
  });

  it('labels a day the way a listing does', () => {
    expect(dayLabel('2026-09-06')).toBe('Sun 6 Sep');
    expect(dayLabel('2026-09-07')).toBe('Mon 7 Sep');
    expect(dayLabel('2026-01-31')).toBe('Sat 31 Jan');
    expect(dayLabel('nope')).toBe('');
  });

  it('offers today and tomorrow, and nothing beyond them', () => {
    const tabs = dayTabs(TODAY);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toEqual({ key: '2026-09-06', label: 'Today · Sun 6 Sep', today: true });
    expect(tabs[1]).toEqual({ key: '2026-09-07', label: 'Tomorrow · Mon 7 Sep', today: false });
  });

  it('takes today from the server answer, never from this device', () => {
    expect(todayKey([AFTER_DARK])).toBe('2026-09-06');
    expect(todayKey([null, AFTER_DARK])).toBe('2026-09-06');
    expect(todayKey([{ from: null }])).toBe(null);
    expect(todayKey([])).toBe(null);
    expect(todayKey(null)).toBe(null);
  });
});

describe('the line across the top', () => {
  it('names the clock today', () => {
    expect(nowLabel('2026-09-06T21:07:00')).toBe('NOW · 21:07');
  });

  it('says NOW alone when the answer carries no clock', () => {
    expect(nowLabel(null)).toBe('NOW');
  });

  it('goes quiet and names the day tomorrow', () => {
    expect(quietLabel('2026-09-07')).toBe('MONDAY 7 SEP');
    expect(quietLabel(null)).toBe('');
  });
});

describe('a programme row', () => {
  it('leads a film with its title and says what it is and how long', () => {
    const row = guideRow(film('predator', 'Predator', '2026-09-06T21:55:00', '2026-09-06T23:42:00', 6420));
    expect(row).toEqual({ kind: 'programme', time: '21:55', title: 'Predator', sub: 'Film · 1h 47m' });
  });

  it('leads an episode with its SHOW and puts the episode underneath', () => {
    const row = guideRow(episode('bb-s2e4', 'Blood', '2026-09-06T22:06:00', '2026-09-06T22:28:00', 1320, 2, 4));
    expect(row).toEqual({ kind: 'programme', time: '22:06', title: 'Black Books', sub: 'Blood · S2 E4 · 22m' });
  });

  it('names an item type it has not been taught rather than guessing', () => {
    const row = guideRow(film('odd', 'Something', '2026-09-06T22:06:00', '2026-09-06T22:28:00', 1320));
    row.sub = guideRow(Object.assign(film('odd', 'Something', '2026-09-06T22:06:00', '2026-09-06T22:28:00', 1320),
      { item: { item_id: 'odd', title: 'Something', itemType: 'lecture', duration: 1320, series: null } })).sub;
    expect(row.sub).toBe('lecture · 22m');
  });

  it('draws an item the catalog no longer knows as a bare title', () => {
    const row = guideRow({ kind: 'programme', starts_at: '2026-09-06T22:06:00',
                           ends_at: '2026-09-06T22:28:00', item: { item_id: 'gone-away' } });
    expect(row).toEqual({ kind: 'programme', time: '22:06', title: 'gone-away', sub: '' });
  });

  it('survives a row with no item at all rather than taking the page down', () => {
    const row = guideRow({ kind: 'programme', starts_at: '2026-09-06T22:06:00', ends_at: null, item: null });
    expect(row).toEqual({ kind: 'programme', time: '22:06', title: '', sub: '' });
  });
});

describe('runtimes', () => {
  it('reads minutes under the hour and hours over it', () => {
    expect(runtimeLabel(1320)).toBe('22m');
    expect(runtimeLabel(6420)).toBe('1h 47m');
    expect(runtimeLabel(3600)).toBe('1h 00m');
  });

  it('pads the minutes past the hour, so a column of them lines up', () => {
    expect(runtimeLabel(7620)).toBe('2h 07m');
  });

  it('floors rather than rounding up — an item is over when its minutes are up', () => {
    expect(runtimeLabel(1379)).toBe('22m');
  });

  it('says nothing at all for a runtime it does not have', () => {
    expect(runtimeLabel(null)).toBe('');
    expect(runtimeLabel(0)).toBe('');
    expect(runtimeLabel(30)).toBe('');
    expect(runtimeLabel(-600)).toBe('');
    expect(runtimeLabel('later')).toBe('');
  });
});

describe('runs — the shape a day is actually made of', () => {
  it('breaks the listing into unbroken stretches of programmes', () => {
    const runs = guideRuns(AFTER_DARK.entries);
    expect(runs).toHaveLength(2);
    expect(runs[0].startsAt).toBe('2026-09-06T21:55:00');
    expect(runs[0].endsAt).toBe('2026-09-07T02:07:00');
    expect(runs[0].entries).toHaveLength(2);
    expect(runs[1].startsAt).toBe('2026-09-07T20:00:00');
    expect(runs[1].endsAt).toBe('2026-09-08T02:51:00');
    expect(runs[1].entries).toHaveLength(3);
  });

  it('takes the return time off the off-air stretch that follows a run', () => {
    const runs = guideRuns(AFTER_DARK.entries);
    expect(runs[0].backAt).toBe('2026-09-07T20:00:00');
    expect(runs[1].backAt).toBe('2026-09-08T20:00:00');
  });

  it('leaves a run with no return when nothing is written after it', () => {
    const runs = guideRuns([film('a', 'A', '2026-09-06T21:00:00', '2026-09-06T22:00:00', 3600)]);
    expect(runs[0].backAt).toBe(null);
  });

  it('opens no run on a leading off-air stretch — there is nothing in front of it', () => {
    const runs = guideRuns([
      offAir('2026-09-06T21:07:00', '2026-09-06T22:00:00'),
      film('a', 'A', '2026-09-06T22:00:00', '2026-09-06T23:00:00', 3600)
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].startsAt).toBe('2026-09-06T22:00:00');
  });

  it('has no runs at all in an empty listing', () => {
    expect(guideRuns([])).toEqual([]);
    expect(guideRuns(null)).toEqual([]);
  });
});

describe("today's column", () => {
  const column = guideColumn(AFTER_DARK, TODAY, true);

  it('lists what is still to come, and never what has already aired', () => {
    expect(column.rows.map(r => r.time)).toEqual(['21:55', '23:42']);
    expect(column.rows.map(r => r.title)).toEqual(['Predator', 'Minority Report']);
  });

  it('draws no lead — the ON NOW card is the lead, and it comes from the strip', () => {
    expect(column.lead).toBe(null);
  });

  it('keeps a run that crosses midnight in the day it STARTED on', () => {
    // Minority Report runs to 02:07 on Monday and still belongs to Sunday.
    expect(column.tail).toEqual({ stopAt: '2026-09-07T02:07:00', backAt: '2026-09-07T20:00:00', day: TODAY });
  });

  it('says only when it stops, because it cannot know when it started', () => {
    expect(column.hours).toBe('On air until 02:07');
  });

  it('names the real stop and the day it is back', () => {
    // The stop is ON Monday (02:07) and so is the return — but the COLUMN is
    // Sunday, so the day is the half of the answer that matters.
    expect(guideTailLine(column.tail)).toBe('Off air from 02:07 · back Monday 20:00');
  });
});

describe("tomorrow's column", () => {
  const column = guideColumn(AFTER_DARK, TOMORROW, false);

  it("stands the day's first programme where the on-now card was", () => {
    expect(column.lead).toEqual({ kind: 'programme', time: '20:00', title: 'Aliens', sub: 'Film · 2h 17m' });
  });

  it('lists the rest of the day under it, without repeating the first', () => {
    expect(column.rows.map(r => r.title)).toEqual(['Star Trek', 'Bad Boys II']);
  });

  it('names both ends of a day that has not started yet', () => {
    expect(column.hours).toBe('On air 20:00–02:51');
  });

  it('carries the run past midnight rather than filing it under the day after', () => {
    expect(column.tail).toEqual({ stopAt: '2026-09-08T02:51:00', backAt: '2026-09-08T20:00:00', day: TOMORROW });
    expect(guideTailLine(column.tail)).toBe('Off air from 02:51 · back Tuesday 20:00');
  });
});

describe('a channel that is off air', () => {
  it('has no rows, no lead and no tail on a day it does not air', () => {
    const column = guideColumn(AFTER_DARK, '2026-09-09', false);
    expect(column.rows).toEqual([]);
    expect(column.lead).toBe(null);
    expect(column.tail).toBe(null);
    expect(column.hours).toBe('Off air');
  });

  it('says nothing rather than inventing a stop for a day with none', () => {
    expect(guideTailLine(null)).toBe('');
  });

  it('names only the stop when the programme has nothing written after it', () => {
    expect(guideTailLine({ stopAt: '2026-09-06T23:00:00', backAt: null, day: TODAY }))
      .toBe('Off air from 23:00');
  });

  it('says "at" for a return that lands back inside the column\'s own day', () => {
    // The read's far edge: the channel comes back the same day, but after the
    // two days the listing covers, so no run of it is in the column to draw.
    expect(guideTailLine({ stopAt: '2026-09-06T13:00:00', backAt: '2026-09-06T16:00:00', day: TODAY }))
      .toBe('Off air from 13:00 · back at 16:00');
  });

  it('draws a mid-day gap as a row of its own', () => {
    const split = {
      channel_id: 'matinee', name: 'Matinee', item_type: 'film',
      from: '2026-09-06T09:00:00', to: '2026-09-08T09:00:00',
      entries: [
        film('a', 'A', '2026-09-06T10:00:00', '2026-09-06T11:00:00', 3600),
        offAir('2026-09-06T11:00:00', '2026-09-06T14:00:00'),
        film('b', 'B', '2026-09-06T14:00:00', '2026-09-06T15:00:00', 3600)
      ]
    };
    const column = guideColumn(split, TODAY, false);
    expect(column.rows.map(r => r.title)).toEqual(['Off air until 14:00', 'B']);
    expect(column.rows[0]).toEqual({ kind: 'off_air', time: '11:00', title: 'Off air until 14:00', sub: '' });
    // Both runs are the same day, so the hours span the pair of them.
    expect(column.hours).toBe('On air 10:00–15:00');
  });

  it('is on air now when the listing opens on a programme, and off when it opens on a gap', () => {
    const late = {
      entries: [offAir('2026-09-06T21:07:00', '2026-09-06T22:00:00'),
                film('b', 'B', '2026-09-06T22:00:00', '2026-09-06T23:00:00', 3600)]
    };
    expect(guideColumn(late, TODAY, true).hours).toBe('On air 22:00–23:00');
    expect(guideColumn(AFTER_DARK, TODAY, true).hours).toBe('On air until 02:07');
    // A day that is not today is never "already on", whatever it opens with.
    expect(guideColumn(AFTER_DARK, TOMORROW, false).hours).toBe('On air 20:00–02:51');
  });

  it('draws a column at all for a channel whose listing never arrived', () => {
    const column = guideColumn(null, TODAY, true);
    expect(column).toEqual({ hours: 'Off air', lead: null, rows: [], hidden: 0, tail: null });
  });
});

describe('a long evening', () => {
  // Comedy Club: eleven 22-minute episodes where After Dark managed two films.
  // The listing is capped and counted rather than run off the bottom of a
  // screen, which is the reason each channel lists at its own length at all.
  // Eleven of them from 14:00, back to back, the way channel_schedule writes
  // them out: each starts where the one before it ended.
  const stamp = (minutesPastTwo) => '2026-09-06T' +
    String(14 + Math.floor(minutesPastTwo / 60)).padStart(2, '0') + ':' +
    String(minutesPastTwo % 60).padStart(2, '0') + ':00';
  const many = [];
  for (let i = 0; i < 11; i++) {
    many.push(episode('bb-' + i, 'Ep ' + i, stamp(22 * i), stamp(22 * (i + 1)), 1320, 1, i + 1));
  }
  const COMEDY = {
    channel_id: 'comedy-club', name: 'Comedy Club', item_type: 'episode',
    from: '2026-09-06T13:50:00', to: '2026-09-08T13:50:00',
    entries: many.concat([offAir(stamp(242), '2026-09-07T14:00:00')])
  };

  it('lists six and counts the rest', () => {
    const column = guideColumn(COMEDY, TODAY, true);
    expect(column.rows).toHaveLength(GUIDE_MAX_ROWS);
    expect(column.hidden).toBe(5);
    expect(guideMoreLine(column)).toBe('+ 5 more to 18:02');
  });

  it('loses the line entirely when nothing was cut', () => {
    const column = guideColumn(AFTER_DARK, TODAY, true);
    expect(column.hidden).toBe(0);
    expect(guideMoreLine(column)).toBe('');
  });

  it('counts what is hidden from the LISTED rows, not the whole day', () => {
    // Tomorrow's lead is not a hidden row — it is drawn in the band above.
    const column = guideColumn(COMEDY, TODAY, false);
    expect(column.rows).toHaveLength(GUIDE_MAX_ROWS);
    expect(column.hidden).toBe(4);
  });
});

describe('the column head', () => {
  it('names the channel and what it is showing today', () => {
    const column = guideColumn(AFTER_DARK, TODAY, true);
    expect(guideHead(AFTER_DARK, column)).toEqual({ name: 'After Dark', meta: 'Films · On air until 02:07' });
  });

  it('says Episodes for a channel of episodes', () => {
    const column = guideColumn(AFTER_DARK, '2026-09-09', false);
    const head = guideHead({ name: 'Comedy Club', item_type: 'episode' }, column);
    expect(head).toEqual({ name: 'Comedy Club', meta: 'Episodes · Off air' });
  });

  it('names a type it has not been taught rather than dropping it', () => {
    const column = guideColumn(AFTER_DARK, '2026-09-09', false);
    expect(guideHead({ name: 'Odd', item_type: 'lecture' }, column).meta).toBe('lecture · Off air');
  });

  it('draws a head for a channel whose listing never arrived', () => {
    const column = guideColumn(null, TODAY, true);
    expect(guideHead(null, column)).toEqual({ name: '', meta: 'Off air' });
    expect(guideHead({ name: 'After Dark' }, column)).toEqual({ name: 'After Dark', meta: 'Off air' });
  });
});
