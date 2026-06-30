import { readFileSync } from 'node:fs';
import path from 'node:path';

const FONT_FILES = [
  ['400', 'noto-sans-latin-400-normal.woff2'],
  ['400', 'noto-sans-latin-ext-400-normal.woff2'],
  ['700', 'noto-sans-latin-700-normal.woff2'],
  ['700', 'noto-sans-latin-ext-700-normal.woff2']
] as const;

let cachedCss: string | null = null;

function notoSansFontPath(fileName: string): string {
  return path.join(
    process.cwd(),
    'node_modules/@fontsource/noto-sans/files',
    fileName
  );
}

function woff2DataUri(fileName: string): string {
  const bytes = readFileSync(notoSansFontPath(fileName));
  return `data:font/woff2;base64,${bytes.toString('base64')}`;
}

/** Embedded Noto Sans (latin + latin-ext) so ₹ and Indian amounts render in headless PDF. */
export function printFontFaceCss(): string {
  if (cachedCss) return cachedCss;

  cachedCss = FONT_FILES.map(
    ([weight, fileName]) => `
@font-face {
  font-family: 'BuildCon Print';
  src: url('${woff2DataUri(fileName)}') format('woff2');
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
}`
  ).join('');

  return cachedCss;
}

export function injectPrintFontsIntoHtml(html: string): string {
  const css = printFontFaceCss();
  const styleTag = `<style>${css}</style>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${styleTag}</head>`);
  }
  return `${styleTag}${html}`;
}
