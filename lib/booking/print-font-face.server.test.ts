import { describe, expect, it } from 'vitest';

import {
  injectPrintFontsIntoHtml,
  printFontFaceCss
} from './print-font-face.server';

describe('printFontFaceCss', () => {
  it('embeds Noto Sans faces for PDF rupee rendering', () => {
    const css = printFontFaceCss();
    expect(css).toContain("@font-face");
    expect(css).toContain("font-family: 'BuildCon Print'");
    expect(css).toContain('data:font/woff2;base64,');
    expect(css.match(/@font-face/g)?.length).toBe(4);
  });

  it('injects font CSS before </head>', () => {
    const html = '<html><head><title>x</title></head><body>₹</body></html>';
    const out = injectPrintFontsIntoHtml(html);
    expect(out).toContain('<style>');
    expect(out.indexOf('<style>')).toBeLessThan(out.indexOf('</head>'));
    expect(out).toContain('₹');
  });
});
