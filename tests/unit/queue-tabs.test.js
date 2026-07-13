import { tabShellHtml, phTabShellHtml } from '../../core/queue-tabs.js';

// FEAT-039 (TASK-238): the shared Queue View tab shell. Music + video queues have
// separate models but the same Now Playing header + Queue / Next / Coming Up tab
// layout; this pure shell wraps the per-tab body HTML each module supplies.
function panels(emptyFlags) {
  return [
    { tab: 'queue', label: 'Queue', html: '<i>q</i>', empty: emptyFlags[0] },
    { tab: 'next', label: 'Next', html: '<i>n</i>', empty: emptyFlags[1] },
    { tab: 'coming-up', label: 'Coming Up', html: '<i>c</i>', empty: emptyFlags[2] }
  ];
}

describe('tabShellHtml (TV)', () => {
  it('renders the header, a tab button + a panel per entry', () => {
    var html = tabShellHtml('<header/>', panels([false, false, false]));
    expect(html).toContain('<header/>');
    expect(html).toContain('class="qtab-bar"');
    expect(html).toContain('data-act="tab" data-tab="queue"');
    expect(html).toContain('>Coming Up</button>');
    expect(html).toContain('class="qtab-panel active" data-tab="queue"');
    expect(html).toContain('<i>n</i>');
    // Each panel closes its own div, and the coming-up panel wraps its body.
    expect(html).toContain('role="tabpanel">');
    expect(html).toContain('<i>c</i></div>');
    // Buttons and panels concatenate with no separator (join('')): the bar's tabs
    // are adjacent, the bar closes </div>, and adjacent panels touch.
    expect(html).toContain('</button><button');
    expect(html).toContain('Coming Up</button></div>');
    expect(html).toContain('</div><div class="qtab-panel" data-tab="next"');
  });

  it('opens on the first NON-empty tab', () => {
    var html = tabShellHtml('', panels([true, false, false]));   // Queue empty -> Next
    expect(html).toContain('class="qtab active" data-act="tab" data-tab="next"');
    expect(html).toContain('class="qtab-panel active" data-tab="next"');
    expect(html).toContain('class="qtab-panel" data-tab="queue"');   // inactive
  });

  it('falls back to the first tab when every tab is empty', () => {
    var html = tabShellHtml('', panels([true, true, true]));
    expect(html).toContain('class="qtab active" data-act="tab" data-tab="queue"');
  });
});

describe('phTabShellHtml (companion)', () => {
  it('uses the ph- tab classes and the same active-tab rule', () => {
    var html = phTabShellHtml('', panels([true, false, false]));
    expect(html).toContain('class="ph-qtab-bar"');
    expect(html).toContain('class="ph-qtab active" data-act="tab" data-tab="next"');
    expect(html).toContain('class="ph-qtab-panel active" data-tab="next"');
  });
});
