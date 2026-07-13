import { describe, it, expect } from 'vitest';
import { queueCrumbHtml } from '../../core/queue-crumb.js';

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
