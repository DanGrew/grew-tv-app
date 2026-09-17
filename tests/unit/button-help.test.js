import { HELP_BUTTONS, HELP_NOTHING, HELP_TABLE, hasHelp, helpRows, helpCardHtml, helpKeyAction } from '../../core/button-help.js';

// TASK-633 — the card is data, so this is where the card is actually asserted:
// the words each surface gives a button, the line a silent button still gets,
// and what a key does while the card is up.

describe('HELP_BUTTONS', () => {
  it('lists the ten buttons the card draws, in remote order', () => {
    expect(HELP_BUTTONS.map(function(b) { return b.id; })).toEqual([
      'updown', 'leftright', 'ok', 'home', 'playpause', 'stop', 'context', 'minus', 'plus', 'info'
    ]);
  });
  it('leaves Back off entirely — it sends nothing and is dead by ruling', () => {
    expect(HELP_BUTTONS.map(function(b) { return b.name; })).not.toContain('Back');
  });
  it('gives Info the same words everywhere rather than sixteen copies', () => {
    expect(HELP_BUTTONS[9].words).toBe('Show or close this card');
    expect(HELP_BUTTONS.filter(function(b) { return b.words; }).length).toBe(1);
  });
});

describe('hasHelp', () => {
  it('is true for a surface the table names', () => {
    expect(hasHelp('browse')).toBe(true);
  });
  it('is false for one it does not', () => {
    expect(hasHelp('nowhere')).toBe(false);
  });
  it('is false for an inherited Object property name', () => {
    expect(hasHelp('constructor')).toBe(false);
  });
});

describe('helpRows', () => {
  it('throws for an unknown surface', () => {
    expect(function() { helpRows('nowhere'); }).toThrow('button-help: no row for nowhere');
  });
  it('returns every button, in card order, whatever the surface says', () => {
    expect(helpRows('error').map(function(r) { return r.id; })).toEqual(HELP_BUTTONS.map(function(b) { return b.id; }));
  });
  it('says so when a button does nothing here, rather than leaving it out', () => {
    var rows = helpRows('error');
    var stop = rows.filter(function(r) { return r.id === 'stop'; })[0];
    expect(stop.words).toBe(HELP_NOTHING);
    expect(stop.none).toBe(true);
  });
  it('marks a button that DOES something as not-none', () => {
    var ok = helpRows('error').filter(function(r) { return r.id === 'ok'; })[0];
    expect(ok.words).toBe('Try again');
    expect(ok.none).toBe(false);
  });
  it('carries the glyph and name beside the words', () => {
    var row = helpRows('browse').filter(function(r) { return r.id === 'context'; })[0];
    expect(row.glyph).toBe('☰');
    expect(row.name).toBe('Context');
    expect(row.words).toBe('Add the focused film or music video to its Queue');
  });
  it('gives Info its standing words on every surface', () => {
    var words = Object.keys(HELP_TABLE).map(function(s) {
      return helpRows(s).filter(function(r) { return r.id === 'info'; })[0].words;
    });
    expect(new Set(words)).toEqual(new Set(['Show or close this card']));
  });
});

describe('the rows themselves', () => {
  // The stories name these directly, and they are the ones the parallel FEAT-526
  // rows change — a build that repoints a button and forgets this table turns
  // the card into a liar, so each one is pinned.
  it('tells a viewer watching a film what ☰ and the rocker do (TASK-600, TASK-602)', () => {
    expect(HELP_TABLE.video.jobs.context).toBe('Night Mode — Off, Soft, Strong');
    expect(HELP_TABLE.video.jobs.minus).toBe('Previous');
    expect(HELP_TABLE.video.jobs.plus).toBe('Next');
  });
  it('says ◀▶ skip ten seconds while something plays, not that they move focus', () => {
    expect(HELP_TABLE.video.jobs.leftright).toBe('Skip back / forward 10 seconds');
    expect(HELP_TABLE.audio.jobs.leftright).toBe('Skip back / forward 10 seconds');
    expect(HELP_TABLE.channel.jobs.leftright).toBe('Skip back / forward 10 seconds');
  });
  it('does NOT offer Night Mode on the music player (TASK-600 story 6)', () => {
    expect(HELP_TABLE.audio.jobs.context).toBeUndefined();
    expect(helpRows('audio').filter(function(r) { return r.id === 'context'; })[0].words).toBe(HELP_NOTHING);
  });
  it('keeps the rocker on channels flipping channels, not skipping (TASK-602 story 6)', () => {
    expect(HELP_TABLE.channel.jobs.minus).toBe('Channel down');
    expect(HELP_TABLE.channel.jobs.plus).toBe('Channel up');
  });
  it('says Home steps back to the section list on Browse (TASK-594)', () => {
    expect(HELP_TABLE.browse.jobs.home).toBe('Back to the section list');
  });
  it('says Stop ends playback and goes back, on every player (TASK-599)', () => {
    expect(HELP_TABLE.video.jobs.stop).toBe('Stop, and go back to where it started');
    expect(HELP_TABLE.audio.jobs.stop).toBe('Stop, and go back to where it started');
    expect(HELP_TABLE.channel.jobs.stop).toBe('Stop, and go back to where you tuned in');
    expect(HELP_TABLE.queue.jobs.stop).toBe('Stop, and go back to where it started');
  });
  it('gives Stop nothing to do on a browsing screen (TASK-599 story 6)', () => {
    expect(HELP_TABLE.browse.jobs.stop).toBeUndefined();
    expect(HELP_TABLE.search.jobs.stop).toBeUndefined();
  });
  it('offers ☰ only where something is focused that has a ＋ (TASK-601)', () => {
    var withContext = Object.keys(HELP_TABLE).filter(function(s) { return HELP_TABLE[s].jobs.context; });
    expect(new Set(withContext)).toEqual(new Set(['browse', 'detail', 'album', 'artist', 'rail-grid', 'playlist', 'video', 'channel']));
  });
  it('covers every TV surface the remote reaches', () => {
    expect(new Set(Object.keys(HELP_TABLE))).toEqual(new Set([
      'browse', 'search', 'detail', 'album', 'artist', 'home-movies', 'rail-grid', 'playlist',
      'playlist-create', 'profile', 'guide', 'video', 'audio', 'channel', 'queue', 'error'
    ]));
  });
  it('titles each surface for the viewer, not by its module name', () => {
    expect(HELP_TABLE.video.title).toBe('Watching');
    expect(HELP_TABLE.audio.title).toBe('Listening');
    expect(HELP_TABLE.profile.title).toBe('Who is watching');
  });
});

describe('helpCardHtml', () => {
  it('heads the card with the surface it is describing', () => {
    expect(helpCardHtml('browse')).toContain('Buttons · Browse');
  });
  it('draws a line per button, tagged with which button it is', () => {
    var html = helpCardHtml('video');
    HELP_BUTTONS.forEach(function(b) {
      expect(html).toContain('data-button="' + b.id + '"');
    });
  });
  it('renders the words the table gives, and the glyph beside them', () => {
    var html = helpCardHtml('channel');
    expect(html).toContain('Channel up');
    expect(html).toContain('☰');
  });
  it('dims a button that does nothing here, and only that one', () => {
    var html = helpCardHtml('error');
    expect(html).toContain('help-row help-none');
    expect(html.split('help-none').length - 1).toBe(8);
  });
  it('leaves a live row undimmed', () => {
    expect(helpCardHtml('video')).toContain('class="help-row" data-button="updown"');
  });
  it('names the surface on the panel, so a test can see which row is up', () => {
    expect(helpCardHtml('queue')).toContain('data-surface="queue"');
  });
  it('tells the viewer how to close it', () => {
    expect(helpCardHtml('browse')).toContain('Press i or Home to close');
  });
  it('carries no control — the card is reference only', () => {
    expect(helpCardHtml('browse')).not.toContain('<button');
  });
  it('keeps every font size at the 20px TV floor or above', () => {
    var sizes = helpCardHtml('video').match(/font-size:(\d+)px/g).map(function(s) { return parseInt(s.replace('font-size:', ''), 10); });
    expect(Math.min.apply(null, sizes)).toBeGreaterThanOrEqual(20);
  });
  it('throws for a surface with no row', () => {
    expect(function() { helpCardHtml('nowhere'); }).toThrow('button-help: no row for nowhere');
  });
});

describe('helpKeyAction', () => {
  it('opens on Info while the card is closed', () => {
    expect(helpKeyAction(false, 'i')).toBe('open');
  });
  it('lets every other key through to the screen while closed', () => {
    ['Enter', 'Escape', 'ArrowUp', 'c', '-', '=', ' '].forEach(function(k) {
      expect(helpKeyAction(false, k)).toBe('pass');
    });
  });
  it('closes on Info again while open', () => {
    expect(helpKeyAction(true, 'i')).toBe('close');
  });
  it('closes on Home while open', () => {
    expect(helpKeyAction(true, 'Escape')).toBe('close');
  });
  it('swallows every other key while open, so nothing acts behind it', () => {
    ['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'c', '-', '=', 'Backspace'].forEach(function(k) {
      expect(helpKeyAction(true, k)).toBe('swallow');
    });
  });
});
