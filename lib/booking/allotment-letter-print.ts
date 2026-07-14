import { PRINT_FONT_FAMILY } from '@/lib/booking/print-font-family';
import { formatDisplayDate } from '@/lib/format-display-date';
import { resolveDeveloperTradeName } from '@/lib/organization/organization-settings';
import { brandHeaderHtml } from '@/lib/booking/print-brand-header';

export type AllotmentLetterPrintInput = {
  letterRef?: string | null;
  allotmentDate?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  unitCode?: string | null;
  wingName?: string | null;
  floor?: number | null;
  unitType?: string | null;
  bookingId: string;
  bookingCreatedAt?: string | null;
  bookingAmount?: number | null;
  customerName?: string | null;
  coBuyerNames?: string[];
  customerAddress?: string | null;
  generatedAt?: Date;
  developerName?: string | null;
  authorizedSignatoryName?: string | null;
  logoDataUri?: string | null;
};

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function display(v: string | null | undefined, fallback = '—'): string {
  const s = String(v ?? '').trim();
  return s || fallback;
}

function formatInr(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return `₹ ${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(d: Date): string {
  return formatDisplayDate(d);
}

function formatDateInput(raw: string | null | undefined, fallback: Date): string {
  const s = String(raw ?? '').trim();
  if (!s) return formatDate(fallback);
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  return formatDate(d);
}

/** Human-readable booking id (e.g. BK-2026-A1B2C3). */
export function formatBookingDisplayId(
  id: string,
  createdAt?: string | null
): string {
  const year = createdAt
    ? new Date(createdAt).getFullYear()
    : new Date().getFullYear();
  const compact = id.replace(/-/g, '').slice(-6).toUpperCase();
  return `BK-${year}-${compact}`;
}

function unitDescription(input: AllotmentLetterPrintInput): string {
  const parts = [
    input.unitCode,
    input.wingName ? `Wing ${input.wingName}` : null,
    input.floor != null ? `Floor ${input.floor}` : null,
    input.unitType
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

export function buildAllotmentLetterHtml(input: AllotmentLetterPrintInput): string {
  const at = input.generatedAt ?? new Date();
  const letterDate = formatDateInput(input.allotmentDate, at);
  const letterRef =
    String(input.letterRef ?? '').trim() ||
    formatBookingDisplayId(input.bookingId, input.bookingCreatedAt);
  const bookingRef = formatBookingDisplayId(
    input.bookingId,
    input.bookingCreatedAt
  );
  const project = display(input.projectName, 'the Project');
  const location = display(input.projectLocation, '—');
  const customer = display(input.customerName);
  const brand = resolveDeveloperTradeName(input.developerName);
  const signatory = String(input.authorizedSignatoryName ?? '').trim();
  const coBuyers = (input.coBuyerNames ?? []).filter(Boolean);
  const address = display(input.customerAddress, '');

  const coBuyerBlock =
    coBuyers.length > 0
      ? `<p class="para">Co-applicant(s): ${coBuyers.map((n) => esc(n)).join(', ')}</p>`
      : '';

  const addressBlock =
    address && address !== '—'
      ? `<p class="para addr">${esc(address)}</p>`
      : '';

  const locationSuffix =
    location !== '—' ? `, ${esc(location)}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Allotment Letter — ${esc(input.unitCode ?? bookingRef)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ${PRINT_FONT_FAMILY};
      font-size: 12pt;
      line-height: 1.45;
      color: #000;
      margin: 0;
      padding: 0;
    }
    .letter { max-width: 180mm; margin: 0 auto; }
    .brand-block { text-align: center; margin: 0 0 8px; }
    .brand-logo {
      display: block;
      max-height: 56px;
      max-width: 220px;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: 0 auto 6px;
    }
    .brand {
      text-align: center;
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: 0.02em;
      margin: 0 0 4px;
    }
    .doc-title {
      text-align: center;
      font-size: 13pt;
      font-weight: 700;
      text-decoration: underline;
      margin: 0 0 18px;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 20px;
      font-size: 11pt;
    }
    .para { margin: 0 0 10px; text-align: justify; }
    .addr { margin-bottom: 14px; }
    .details {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 18px;
      font-size: 11pt;
    }
    .details th,
    .details td {
      border: 1px solid #000;
      padding: 6px 10px;
      vertical-align: top;
      text-align: left;
    }
    .details th {
      width: 38%;
      font-weight: 600;
      background: #f5f5f5;
    }
    .sign-block { margin-top: 36px; }
    .sign-line {
      margin-top: 48px;
      border-top: 1px solid #000;
      width: 220px;
      padding-top: 6px;
      font-size: 11pt;
    }
    .muted { font-size: 10pt; color: #333; margin-top: 24px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="letter">
    ${brandHeaderHtml(input)}
    <p class="doc-title">Allotment Letter</p>
    <div class="meta">
      <span><strong>Ref:</strong> ${esc(letterRef)}</span>
      <span><strong>Date:</strong> ${esc(formatDate(at))}</span>
    </div>
    <p class="para">To,</p>
    <p class="para"><strong>${esc(customer)}</strong></p>
    ${addressBlock}
    ${coBuyerBlock}
    <p class="para">
      <strong>Subject:</strong> Allotment of unit in ${esc(project)}${locationSuffix}
    </p>
    <p class="para">Dear Sir/Madam,</p>
    <p class="para">
      With reference to your application and token payment received, we are pleased to inform you
      that the following residential unit has been <strong>allotted</strong> to you in our project
      <strong>${esc(project)}</strong>${location !== '—' ? ` situated at ${esc(location)}` : ''}:
    </p>
    <table class="details">
      <tbody>
        <tr><th>Project</th><td>${esc(project)}</td></tr>
        <tr><th>Unit</th><td>${esc(unitDescription(input))}</td></tr>
        <tr><th>Booking ID</th><td>${esc(bookingRef)}</td></tr>
        <tr><th>Applicant</th><td>${esc(customer)}</td></tr>
        <tr><th>Booking amount</th><td>${esc(formatInr(input.bookingAmount))}</td></tr>
        <tr><th>Allotment date</th><td>${esc(letterDate)}</td></tr>
      </tbody>
    </table>
    <p class="para">
      This allotment is subject to the terms and conditions of the booking application, payment
      schedule, and applicable laws. Please contact our sales office for any clarifications.
    </p>
    <p class="para">Thanking you and assuring you of our best services.</p>
    <div class="sign-block">
      <p class="para">Yours faithfully,</p>
      <p class="para"><strong>For ${esc(brand)}</strong></p>
      <div class="sign-line">${esc(signatory || 'Authorized Signatory')}</div>
    </div>
    <p class="muted">Generated: ${esc(formatDate(at))}</p>
  </div>
</body>
</html>`;
}

function openPrintPreview(html: string, title: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', title);
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden'
  });
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const doc = frameWindow?.document ?? iframe.contentDocument;
  if (!doc || !frameWindow) {
    iframe.remove();
    throw new Error('Could not open print preview.');
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    iframe.remove();
  };

  frameWindow.addEventListener('afterprint', cleanup, { once: true });
  frameWindow.focus();
  window.setTimeout(() => {
    try {
      frameWindow.print();
    } catch {
      cleanup();
      throw new Error('Could not open the print dialog.');
    }
  }, 300);
}

export function printAllotmentLetter(input: AllotmentLetterPrintInput): void {
  openPrintPreview(buildAllotmentLetterHtml(input), 'Allotment letter print preview');
}
