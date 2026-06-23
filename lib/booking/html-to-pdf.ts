import 'server-only';
import type { Browser } from 'playwright-core';

/** Matches @sparticuz/chromium-min@149.0.0. Prefer setting CHROMIUM_PACK_PATH in Vercel. */
const DEFAULT_CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

let browserPromise: Promise<Browser> | null = null;

function resetBrowserCache(): void {
  browserPromise = null;
}

function isStaleBrowserError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Target page, context or browser has been closed') ||
    message.includes('Browser has been closed')
  );
}

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
  );
}

function serverlessChromiumPackPath(): string {
  return (
    process.env.CHROMIUM_PACK_PATH?.trim() ||
    process.env.CHROMIUM_REMOTE_EXEC_PATH?.trim() ||
    DEFAULT_CHROMIUM_PACK_URL
  );
}

async function resolveExecutablePath(): Promise<string> {
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
  if (executablePath) {
    return executablePath;
  }

  const localPath = process.env.CHROMIUM_LOCAL_EXEC_PATH?.trim();
  if (localPath && !isServerlessRuntime()) {
    return localPath;
  }

  if (
    isServerlessRuntime() ||
    process.env.CHROMIUM_PACK_PATH?.trim() ||
    process.env.CHROMIUM_REMOTE_EXEC_PATH?.trim()
  ) {
    const chromium = (await import('@sparticuz/chromium-min')).default;
    chromium.setGraphicsMode = false;
    return chromium.executablePath(serverlessChromiumPackPath());
  }

  // Local dev: Playwright's downloaded Chromium (devDependency via e2e).
  const { chromium } = await import('playwright');
  return chromium.executablePath();
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core');
  const executablePath = await resolveExecutablePath();
  let browser: Browser;

  if (
    isServerlessRuntime() ||
    process.env.CHROMIUM_PACK_PATH?.trim() ||
    process.env.CHROMIUM_REMOTE_EXEC_PATH?.trim()
  ) {
    const chromiumPkg = (await import('@sparticuz/chromium-min')).default;
    browser = await chromium.launch({
      args: chromiumPkg.args,
      executablePath,
      headless: true
    });
  } else {
    browser = await chromium.launch({ executablePath, headless: true });
  }

  browser.on('disconnected', resetBrowserCache);
  return browser;
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.isConnected()) {
      return existing;
    }
    resetBrowserCache();
  }

  browserPromise = launchBrowser().catch((error: unknown) => {
    resetBrowserCache();
    throw error;
  });
  return browserPromise;
}

/** Renders printable booking HTML to a PDF buffer (A4, print backgrounds). */
export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' }
        });
        return Buffer.from(pdf);
      } finally {
        await page.close().catch(() => undefined);
      }
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isStaleBrowserError(error)) {
        resetBrowserCache();
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
