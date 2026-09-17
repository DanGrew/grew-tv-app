import { HELP_BUTTONS, HELP_NOTHING, HELP_TABLE, hasHelp, helpRows, helpCardHtml, helpKeyAction } from '../../core/button-help.js';

// TASK-633 — the card is data, so this is where the card is actually asserted:
// the words each surface gives a button, the line a silent button still gets,
// and what a key does while the card is up.

describe('HELP_BUTTONS', () => {
  // Pinned whole: the card is data, so every glyph and name IS behaviour — a
  // wrong glyph is a card pointing at the wrong button on the handset.
  it('is exactly the ten buttons, with the glyph and name each is drawn with', () => {
    expect(HELP_BUTTONS).toEqual([
      { id: 'updown',    glyph: '▲▼', name: 'Up / Down' },
      { id: 'leftright', glyph: '◀▶', name: 'Left / Right' },
      { id: 'ok',        glyph: '●',  name: 'OK' },
      { id: 'home',      glyph: '⌂',  name: 'Home' },
      { id: 'playpause', glyph: '⏯',  name: 'Play / Pause' },
      { id: 'stop',      glyph: '⏹',  name: 'Stop' },
      { id: 'context',   glyph: '☰',  name: 'Context' },
      { id: 'minus',     glyph: '−',  name: 'Volume down' },
      { id: 'plus',      glyph: '+',  name: 'Volume up' },
      { id: 'info',      glyph: 'i',  name: 'Info', words: 'Show or close this card' }
    ]);
  });
  it('lists the ten buttons the card draws, in remote order', () => {
    expect(HELP_BUTTONS.map(function(b) { return b.id; })).toEqual([
      'updown', 'leftright', 'ok', 'home', 'playpause', 'stop', 'context', 'minus', 'plus', 'info'
    ]);
  });
  it('says what a button with no job here reads as', () => {
    expect(HELP_NOTHING).toBe('Does nothing here');
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

describe('the table, whole', () => {
  // Every word on the card, stated once here independently of the module. This
  // is the regression guard the risk in the spec asks for: a row that changes
  // what a button does has to come here and say so, and a word that changes by
  // accident fails loudly rather than shipping a card that lies.
  const PLAYING = {
    updown: 'Move between the player controls',
    leftright: 'Skip back / forward 10 seconds',
    ok: 'Press the focused control',
    playpause: 'Play or pause'
  };

  it('says exactly this, for every surface', () => {
    expect(HELP_TABLE).toEqual({
      browse: { title: 'Browse', jobs: {
        updown: 'Move between rails',
        leftright: 'Move along a rail',
        ok: 'Open or play what is focused',
        home: 'Back to the section list',
        context: 'Add the focused film or music video to its Queue'
      } },
      search: { title: 'Search', jobs: {
        updown: 'Move between the keys and the results',
        leftright: 'Move along a row of keys',
        ok: 'Type the letter, or open the result',
        home: 'Close Search'
      } },
      detail: { title: 'Series', jobs: {
        updown: 'Move between episodes',
        leftright: 'Move along a row — Restart, ＋ Queue',
        ok: 'Play the episode, or press what is focused',
        home: 'Back one step',
        context: 'Add the focused episode to the Queue'
      } },
      album: { title: 'Album', jobs: {
        updown: 'Move between tracks',
        leftright: 'Move along a row',
        ok: 'Play the track, or press what is focused',
        home: 'Back one step',
        context: 'Add the focused track to a playlist'
      } },
      artist: { title: 'Artist', jobs: {
        updown: 'Move between tracks',
        leftright: 'Move along a row',
        ok: 'Play the track, or press what is focused',
        home: 'Back one step',
        context: 'Add the focused track to a playlist'
      } },
      'home-movies': { title: 'Home movies', jobs: {
        updown: 'Move between clips',
        leftright: 'Move along a row',
        ok: 'Play the clip',
        home: 'Back one step'
      } },
      'rail-grid': { title: 'Rail', jobs: {
        updown: 'Move between rows of the grid',
        leftright: 'Move along a row',
        ok: 'Open or play what is focused',
        home: 'Back one step',
        context: 'Add the focused film or music video to its Queue'
      } },
      playlist: { title: 'Playlist', jobs: {
        updown: 'Move between tracks',
        leftright: 'Move along a row',
        ok: 'Play the track, or press what is focused',
        home: 'Back one step',
        context: "Press the focused track's ＋, where it has one"
      } },
      'playlist-create': { title: 'New playlist', jobs: {
        updown: 'Move between rows of keys',
        leftright: 'Move along a row of keys',
        ok: 'Type the letter, or press what is focused',
        home: 'Cancel the new playlist'
      } },
      profile: { title: 'Who is watching', jobs: {
        updown: 'Move between rows',
        leftright: 'Move between people',
        ok: 'Choose the person, or press the PIN key',
        home: 'Close the PIN pad or the take-over prompt'
      } },
      guide: { title: 'Guide', jobs: {
        updown: 'Scroll the listings, up to the day tabs',
        leftright: 'Move between channels',
        ok: 'Watch the focused channel',
        home: 'Back one step'
      } },
      video: { title: 'Watching', jobs: Object.assign({}, PLAYING, {
        stop: 'Stop, and go back to where it started',
        home: 'Stop, and go back to where it started',
        context: 'Night Mode — Off, Soft, Strong',
        minus: 'Previous',
        plus: 'Next'
      }) },
      audio: { title: 'Listening', jobs: Object.assign({}, PLAYING, {
        stop: 'Stop, and go back to where it started',
        home: 'Stop, and go back to where it started',
        minus: 'Previous track',
        plus: 'Next track'
      }) },
      channel: { title: 'Channel', jobs: Object.assign({}, PLAYING, {
        stop: 'Stop, and go back to where you tuned in',
        home: 'Stop, and go back to where you tuned in',
        context: 'Night Mode — Off, Soft, Strong',
        minus: 'Channel down',
        plus: 'Channel up'
      }) },
      queue: { title: 'Queue', jobs: {
        updown: 'Move between rows',
        leftright: 'Move along a row',
        ok: 'Press what is focused',
        home: 'Close the Queue',
        playpause: 'Play or pause',
        stop: 'Stop, and go back to where it started',
        minus: 'Previous',
        plus: 'Next'
      } },
      error: { title: 'Something went wrong', jobs: {
        ok: 'Try again'
      } }
    });
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

describe('helpCardHtml, to the character', () => {
  // The card is dropped into whichever page is up, so it carries its own look
  // and the look is behaviour: the grid that lines the three columns up, the
  // dimming that tells a dead button from a live one, and the 20px TV floor.
  // Spelled out here rather than read from the module, or a style could go
  // missing with the test still green.
  const ROW = 'display:grid;grid-template-columns:72px 190px 1fr;gap:16px;align-items:center;padding:8px 0;font-size:24px;';
  const DIM = 'color:rgba(255,255,255,0.45);';

  function row(id, glyph, name, words, none) {
    return '<div class="help-row' + (none ? ' help-none' : '') + '" data-button="' + id + '" style="' + ROW + (none ? DIM : '') + '">' +
      '<span class="help-glyph" style="font-size:30px;text-align:center;">' + glyph + '</span>' +
      '<span class="help-name" style="font-weight:600;">' + name + '</span>' +
      '<span class="help-words">' + words + '</span></div>';
  }

  it('draws the error screen\'s card exactly like this', () => {
    const N = 'Does nothing here';
    expect(helpCardHtml('error')).toBe(
      '<div class="help-panel" data-surface="error" style="min-width:760px;max-width:1000px;padding:32px 40px;border-radius:16px;border:2.5px solid rgba(255,255,255,0.13);background:rgba(16,22,46,0.96);color:rgba(255,255,255,0.95);font-family:-apple-system,\'Segoe UI\',system-ui,sans-serif;">' +
      '<div class="help-title" style="font-size:36px;font-weight:700;margin-bottom:16px;">Buttons · Something went wrong</div>' +
      row('updown', '▲▼', 'Up / Down', N, true) +
      row('leftright', '◀▶', 'Left / Right', N, true) +
      row('ok', '●', 'OK', 'Try again', false) +
      row('home', '⌂', 'Home', N, true) +
      row('playpause', '⏯', 'Play / Pause', N, true) +
      row('stop', '⏹', 'Stop', N, true) +
      row('context', '☰', 'Context', N, true) +
      row('minus', '−', 'Volume down', N, true) +
      row('plus', '+', 'Volume up', N, true) +
      row('info', 'i', 'Info', 'Show or close this card', false) +
      '<div class="help-foot" style="font-size:22px;margin-top:16px;color:rgba(255,255,255,0.6);">Press i or Home to close</div></div>'
    );
  });

  it('draws a live row of a player\'s card the same way, with this surface\'s words', () => {
    expect(helpCardHtml('video')).toContain(row('context', '☰', 'Context', 'Night Mode — Off, Soft, Strong', false));
    expect(helpCardHtml('channel')).toContain(row('plus', '+', 'Volume up', 'Channel up', false));
  });

  it('runs the rows straight together, with nothing between them', () => {
    const html = helpCardHtml('video');
    expect(html).toContain('</div><div class="help-row"');
    expect(html).not.toContain('Stryker');
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
