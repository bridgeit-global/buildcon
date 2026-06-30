import { formatBookingDisplayId } from '@/lib/booking/allotment-letter-print';
import { PRINT_FONT_FAMILY } from '@/lib/booking/print-font-family';
import { formatDisplayDate } from '@/lib/format-display-date';

export type BookingSalesDocPrintBase = {
  bookingId: string;
  bookingCreatedAt?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  unitCode?: string | null;
  wingName?: string | null;
  floor?: number | null;
  unitType?: string | null;
  customerName?: string | null;
  coBuyerNames?: string[];
  bookingAmount?: number | null;
  workflowStage?: string | null;
  paymentMode?: string | null;
  generatedAt?: Date;
  /** When set (e.g. from a collection entry), receipt shows this amount instead of booking amount. */
  receivedAmount?: number | null;
  receivedAt?: string | null;
  paymentReference?: string | null;
  instalmentLabel?: string | null;
  /** Demand letter: amount due for this instalment / milestone. */
  demandAmount?: number | null;
  demandDueDate?: string | null;
};

export function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function display(v: string | null | undefined, fallback = '—'): string {
  const s = String(v ?? '').trim();
  return s || fallback;
}

export function formatInr(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return `₹ ${Number(amount).toLocaleString('en-IN')}`;
}

export function formatPrintDate(d: Date): string {
  return formatDisplayDate(d);
}

function formatDate(d: Date): string {
  return formatPrintDate(d);
}

export function unitLine(input: BookingSalesDocPrintBase): string {
  const parts = [
    input.unitCode,
    input.wingName ? `Wing ${input.wingName}` : null,
    input.floor != null ? `Floor ${input.floor}` : null,
    input.unitType
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
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

export function sharedStyles(): string {
  return `
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
    .doc { max-width: 180mm; margin: 0 auto; }
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
      margin-bottom: 16px;
      font-size: 11pt;
    }
    .para { margin: 0 0 10px; text-align: justify; }
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
      width: 36%;
      font-weight: 600;
      background: #f5f5f5;
    }
    .sign-block { margin-top: 28px; }
    .sign-line {
      margin-top: 44px;
      border-top: 1px solid #000;
      width: 220px;
      padding-top: 6px;
      font-size: 11pt;
    }
    .muted { font-size: 10pt; color: #333; margin-top: 20px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

export function buildBookingReceiptHtml(input: BookingSalesDocPrintBase): string {
  const at = input.generatedAt ?? new Date();
  const bookingRef = formatBookingDisplayId(input.bookingId, input.bookingCreatedAt);
  const receiptSuffix = input.paymentReference?.trim()
    ? input.paymentReference.trim().slice(0, 12)
    : formatDate(at).replace(/\s/g, '');
  const receiptNo = `RC-${bookingRef.replace(/^BK-/, '')}-${receiptSuffix}`;
  const amountReceived =
    input.receivedAmount != null && !Number.isNaN(Number(input.receivedAmount))
      ? Number(input.receivedAmount)
      : input.bookingAmount;
  const receivedDate =
    input.receivedAt?.trim() ||
    formatDate(at);
  const project = display(input.projectName, 'the Project');
  const location = display(input.projectLocation, '—');
  const customer = display(input.customerName);
  const coBuyers = (input.coBuyerNames ?? []).filter(Boolean);
  const coBlock =
    coBuyers.length > 0
      ? `<p class="para">Co-applicant(s): ${coBuyers.map((n) => esc(n)).join(', ')}</p>`
      : '';
  const locationSuffix = location !== '—' ? `, ${esc(location)}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt — ${esc(input.unitCode ?? bookingRef)}</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <div class="doc">
    <p class="brand">BuildCon</p>
    <p class="doc-title">Payment receipt</p>
    <div class="meta">
      <span><strong>Receipt no.:</strong> ${esc(receiptNo)}</span>
      <span><strong>Date:</strong> ${esc(formatDate(at))}</span>
    </div>
    <p class="para">Received with thanks from <strong>${esc(customer)}</strong></p>
    ${coBlock}
    <p class="para">
      the sum of <strong>${esc(formatInr(amountReceived))}</strong> towards
      ${input.instalmentLabel ? esc(input.instalmentLabel) : 'booking / instalment dues'} for the unit
      described below in <strong>${esc(project)}</strong>${locationSuffix}.
    </p>
    <table class="details">
      <tbody>
        <tr><th>Project</th><td>${esc(project)}</td></tr>
        <tr><th>Unit</th><td>${esc(unitLine(input))}</td></tr>
        <tr><th>Booking reference</th><td>${esc(bookingRef)}</td></tr>
        ${input.instalmentLabel ? `<tr><th>Instalment</th><td>${esc(input.instalmentLabel)}</td></tr>` : ''}
        <tr><th>Payment mode</th><td>${esc(display(input.paymentMode, '—'))}</td></tr>
        <tr><th>Payment date</th><td>${esc(receivedDate)}</td></tr>
        <tr><th>Reference</th><td>${esc(display(input.paymentReference, '—'))}</td></tr>
        <tr><th>Amount received</th><td>${esc(formatInr(amountReceived))}</td></tr>
      </tbody>
    </table>
    <p class="para">
      This receipt is issued subject to realisation of cheque / NEFT and the terms of the booking.
      Please retain this for your records.
    </p>
    <div class="sign-block">
      <p class="para">For <strong>BuildCon</strong></p>
      <div class="sign-line">Authorised signatory</div>
    </div>
    <p class="muted">Generated: ${esc(formatDate(at))} · Workflow: ${esc(display(input.workflowStage, '—'))}</p>
  </div>
</body>
</html>`;
}

export function printBookingReceipt(input: BookingSalesDocPrintBase): void {
  openPrintPreview(buildBookingReceiptHtml(input), 'Booking receipt print preview');
}

export function buildDemandLetterHtml(input: BookingSalesDocPrintBase): string {
  const at = input.generatedAt ?? new Date();
  const bookingRef = formatBookingDisplayId(input.bookingId, input.bookingCreatedAt);
  const demandSuffix = input.instalmentLabel?.trim()
    ? input.instalmentLabel.trim().slice(0, 16)
    : formatDate(at).replace(/\s/g, '');
  const demandRef = `DL-${bookingRef.replace(/^BK-/, '')}-${demandSuffix}`;
  const dueAmount = input.demandAmount ?? input.bookingAmount;
  const project = display(input.projectName, 'the Project');
  const location = display(input.projectLocation, '—');
  const customer = display(input.customerName);
  const addressSuffix = location !== '—' ? ` situated at ${esc(location)}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Demand letter — ${esc(input.unitCode ?? bookingRef)}</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <div class="doc">
    <p class="brand">BuildCon</p>
    <p class="doc-title">Demand letter (dues)</p>
    <div class="meta">
      <span><strong>Ref:</strong> ${esc(demandRef)}</span>
      <span><strong>Date:</strong> ${esc(formatDate(at))}</span>
    </div>
    <p class="para">To,</p>
    <p class="para"><strong>${esc(customer)}</strong></p>
    <p class="para"><strong>Subject:</strong> Demand for payment — ${esc(project)} — Unit ${esc(display(input.unitCode))}</p>
    <p class="para">Dear Sir/Madam,</p>
    <p class="para">
      With reference to your booking <strong>${esc(bookingRef)}</strong> for unit <strong>${esc(
        unitLine(input)
      )}</strong> in our project <strong>${esc(project)}</strong>${addressSuffix}, you are requested to
      remit ${input.instalmentLabel ? `the amount due for <strong>${esc(input.instalmentLabel)}</strong>` : 'all outstanding instalments and charges as per the agreed payment schedule'} without further delay.
    </p>
    <p class="para">
      Kindly note that continued default may attract interest / penalties and other remedies as per the
      booking terms and applicable law. If payment has already been made, please ignore this letter and
      share the transaction reference with our accounts team.
    </p>
    <table class="details">
      <tbody>
        <tr><th>Booking reference</th><td>${esc(bookingRef)}</td></tr>
        <tr><th>Unit</th><td>${esc(unitLine(input))}</td></tr>
        ${input.instalmentLabel ? `<tr><th>Instalment / milestone</th><td>${esc(input.instalmentLabel)}</td></tr>` : ''}
        <tr><th>Amount demanded</th><td>${esc(formatInr(dueAmount))}</td></tr>
        ${input.demandDueDate ? `<tr><th>Due date</th><td>${esc(formatDisplayDate(input.demandDueDate))}</td></tr>` : ''}
        <tr><th>Current workflow stage</th><td>${esc(display(input.workflowStage, '—'))}</td></tr>
      </tbody>
    </table>
    <p class="para">
      You are requested to clear the dues within <strong>15 (fifteen)</strong> days from the date of this letter.
    </p>
    <div class="sign-block">
      <p class="para">Yours faithfully,</p>
      <p class="para"><strong>For BuildCon</strong></p>
      <div class="sign-line">Authorised signatory</div>
    </div>
    <p class="muted">Generated: ${esc(formatDate(at))}</p>
  </div>
</body>
</html>`;
}

export function printDemandLetter(input: BookingSalesDocPrintBase): void {
  openPrintPreview(buildDemandLetterHtml(input), 'Demand letter print preview');
}

export function buildSaleAgreementHtml(input: BookingSalesDocPrintBase): string {
  const at = input.generatedAt ?? new Date();
  const bookingRef = formatBookingDisplayId(input.bookingId, input.bookingCreatedAt);
  const agreementRef = `AGR-${bookingRef.replace(/^BK-/, '')}`;
  const project = display(input.projectName, 'the Project');
  const location = display(input.projectLocation, '—');
  const customer = display(input.customerName);
  const coBuyers = (input.coBuyerNames ?? []).filter(Boolean);
  const coBlock =
    coBuyers.length > 0
      ? `<p class="para"><strong>Co-applicant(s):</strong> ${coBuyers.map((n) => esc(n)).join(', ')}</p>`
      : '';
  const locationSuffix = location !== '—' ? ` at ${esc(location)}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Agreement — ${esc(input.unitCode ?? bookingRef)}</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <div class="doc">
    <p class="brand">BuildCon</p>
    <p class="doc-title">Draft sale agreement (booking)</p>
    <div class="meta">
      <span><strong>Agreement ref.:</strong> ${esc(agreementRef)}</span>
      <span><strong>Date:</strong> ${esc(formatDate(at))}</span>
    </div>
    <p class="para">
      This <strong>draft</strong> agreement is generated from CRM data for review and execution. Final terms,
      annexures, and stamp duty shall be completed as per legal advice and RERA / local regulations.
    </p>
    <p class="para"><strong>Between</strong></p>
    <p class="para">
      <strong>BuildCon</strong>, developer of the residential project known as <strong>${esc(project)}</strong>${locationSuffix}
      (hereinafter called the &quot;Developer&quot;),
    </p>
    <p class="para"><strong>And</strong></p>
    <p class="para">
      <strong>${esc(customer)}</strong> (hereinafter called the &quot;Allottee&quot;).
    </p>
    ${coBlock}
    <p class="para"><strong>1. Property</strong></p>
    <p class="para">
      The Developer agrees to sell and the Allottee agrees to purchase the apartment / unit more particularly
      described as <strong>${esc(unitLine(input))}</strong> in the said project, subject to the final area
      statement and permissible variations under law.
    </p>
    <p class="para"><strong>2. Consideration and payment</strong></p>
    <p class="para">
      The total consideration, taxes, and payment schedule shall be as per the booking form, cost sheet, and
      payment plan accepted by the Allottee. Booking reference: <strong>${esc(bookingRef)}</strong>.
      Token / booking amount on record: <strong>${esc(formatInr(input.bookingAmount))}</strong>.
      Mode (if recorded): <strong>${esc(display(input.paymentMode, '—'))}</strong>.
    </p>
    <p class="para"><strong>3. Possession and defaults</strong></p>
    <p class="para">
      Possession shall be offered subject to receipt of all dues, completion of documentation, and compliance
      with applicable laws. Events of default, interest, and termination shall follow the approved agreement
      template for this project.
    </p>
    <p class="para"><strong>4. General</strong></p>
    <p class="para">
      This draft is for office use and customer discussion only. Executed agreements must bear authorised
      signatures, schedules, and stamps as applicable.
    </p>
    <div class="sign-block">
      <table class="details" style="margin-top: 8px;">
        <tbody>
          <tr>
            <th style="width:50%">For BuildCon (Developer)</th>
            <th style="width:50%">Allottee</th>
          </tr>
          <tr>
            <td style="height: 72px; vertical-align: bottom;">Signature &amp; seal</td>
            <td style="height: 72px; vertical-align: bottom;">Signature</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted">Generated: ${esc(formatDate(at))} · Workflow: ${esc(display(input.workflowStage, '—'))}</p>
  </div>
</body>
</html>`;
}

export function printSaleAgreement(input: BookingSalesDocPrintBase): void {
  openPrintPreview(buildSaleAgreementHtml(input), 'Sale agreement print preview');
}
