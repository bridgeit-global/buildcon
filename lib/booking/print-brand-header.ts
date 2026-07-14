import { resolveDeveloperTradeName } from '@/lib/organization/organization-settings';

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Centered brand logo + trade name for printable documents. */
export function brandHeaderHtml(input: {
  developerName?: string | null;
  logoDataUri?: string | null;
}): string {
  const brand = resolveDeveloperTradeName(input.developerName);
  const logo = String(input.logoDataUri ?? '').trim();
  if (logo) {
    // Data URIs must not be HTML-escaped (base64 is attribute-safe).
    return `<div class="brand-block">
      <img class="brand-logo" src="${logo}" alt="" />
      <p class="brand">${esc(brand)}</p>
    </div>`;
  }
  return `<p class="brand">${esc(brand)}</p>`;
}
