import { describe, it, expect } from 'vitest';
import { deviceBadgeMarkup } from '../../core/device-badge.js';

describe('deviceBadgeMarkup', () => {
  it('builds a swatch element and a label element', () => {
    const html = deviceBadgeMarkup('Screen · ab12');
    expect(html).toContain('id="device-swatch"');
    expect(html).toContain('id="device-name"');
  });

  it('embeds the label text', () => {
    expect(deviceBadgeMarkup('Living Room')).toContain('Living Room');
  });

  it('escapes HTML in the label so a hostile name cannot inject markup', () => {
    const html = deviceBadgeMarkup('<img src=x onerror=1>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
  });

  it('coerces a non-string label without throwing', () => {
    expect(deviceBadgeMarkup(undefined)).toContain('id="device-name"');
  });
});
