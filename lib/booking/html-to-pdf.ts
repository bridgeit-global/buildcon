import 'server-only';
import type { Browser } from 'playwright-core';

/** Matches @sparticuz/chromium-min@149.0.0 — override with CHROMIUM_REMOTE_EXEC_PATH. */
const DEFAULT_CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

let browserPromise: Promise<Browser> | null = null;

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
  );
}

async function resolveExecutablePath(): Promise<string> {
  const localPath = process.env.CHROMIUM_LOCAL_EXEC_PATH?.trim();
  if (localPath && !isServerlessRuntime()) {
    return localPath;
  }

  if (isServerlessRuntime() || process.env.CHROMIUM_REMOTE_EXEC_PATH?.trim()) {
    const chromium = (await import('@sparticuz/chromium-min')).default;
    chromium.setGraphicsMode = false;
    const packUrl =
      process.env.CHROMIUM_REMOTE_EXEC_PATH?.trim() || DEFAULT_CHROMIUM_PACK_URL;
    return chromium.executablePath(packUrl);
  }

  // Local dev: Playwright's downloaded Chromium (devDependency via e2e).
  const { chromium } = await import('playwright');
  return chromium.executablePath();
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  const executablePath = await resolveExecutablePath();

  if (isServerlessRuntime() || process.env.CHROMIUM_REMOTE_EXEC_PATH?.trim()) {
    const chromiumPkg = (await import('@sparticuz/chromium-min')).default;
    return chromium.launch({
      args: chromiumPkg.args,
      executablePath,
      headless: true
    });
  }

  return chromium.launch({ executablePath, headless: true });
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }
  return browserPromise;
}

/** Renders printable booking HTML to a PDF buffer (A4, print backgrounds). */
export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' }
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
