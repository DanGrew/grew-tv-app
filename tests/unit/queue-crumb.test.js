import { describe, it, expect } from 'vitest';
import { queueCrumbHtml, companionQueueCrumbHtml } from '../../core/queue-crumb.js';

describe('queueCrumbHtml', () => {
  it('renders a breadcrumb nav with a clickable back crumb and a Queue leaf', () => {
    var html = queueCrumbHtml();
    expect(html).toContain('class="breadcrumb"');
    expect(html).toContain('id="queue-crumb-back"');
    expect(html).toContain('crumb-link');
    expect(html).toContain('Now Playing');
    expect(html).toContain('Queue');
    // Every element is closed and the separator sits between the two crumbs.
    expect(html).toContain('Now Playing</button>');
    expect(html).toContain('Queue</span>');
    expect(html).toContain('</nav>');
    expect(html).toContain('<span class="crumb-sep" aria-hidden="true">›</span>');
  });

  it('the back crumb is a button (closes the overlay), not a navigation link', () => {
    var html = queueCrumbHtml();
    expect(html).toContain('<button type="button"');
    // No data-page/data-params: this crumb closes the overlay, it does not navigate.
    expect(html).not.toContain('data-page');
    expect(html).not.toContain('data-params');
  });

  it('the Queue leaf is an inert current crumb, not focusable', () => {
    var html = queueCrumbHtml();
    expect(html).toContain('crumb-current');
  });
});

// TASK-515 — the phone's own crumb. Every companion Queue page hardcodes a
// bare back button with no leaf, so it reads "‹ Now Playing" where the design
// specifies "‹ Now Playing › Queue".
describe('companionQueueCrumbHtml', () => {
  it('renders the back button AND the Queue leaf the phone was missing', () => {
    expect(companionQueueCrumbHtml()).toBe('<nav class="ph-crumb" aria-label="Breadcrumb"><button type="button" class="back" id="btn-back" aria-label="Back to player">‹ Now Playing</button><span class="ph-crumb-sep" aria-hidden="true">›</span><span class="ph-crumb-current">Queue</span></nav>');
  });

  it('keeps the #btn-back id and .back class the companion pages already wire', () => {
    var html = companionQueueCrumbHtml();
    expect(html).toContain('id="btn-back"');
    expect(html).toContain('class="back"');
    expect(html).toContain('aria-label="Back to player"');
  });

  it('speaks the same two labels as the TV crumb, in the phone class set', () => {
    var html = companionQueueCrumbHtml();
    expect(html).toContain('‹ Now Playing</button>');
    expect(html).toContain('Queue</span>');
    expect(html).not.toContain('class="breadcrumb"');
    expect(html).not.toContain('class="crumb crumb-current"');
  });
});
