import { formatBookingDisplayId } from '@/lib/booking/allotment-letter-print';
import {
  display,
  esc,
  formatPrintDate,
  sharedStyles,
  unitLine,
  type BookingSalesDocPrintBase
} from '@/lib/booking/booking-receipt-demand-agreement-print';
import { brandHeaderHtml } from '@/lib/booking/print-brand-header';
import { resolveDeveloperTradeName } from '@/lib/organization/organization-settings';

export type PossessionLetterInput = BookingSalesDocPrintBase & {
  possessionDate?: string | null;
  occupancyCertificateRef?: string | null;
  handoverContact?: string | null;
};

export function buildPossessionLetterHtml(input: PossessionLetterInput): string {
  const at = input.generatedAt ?? new Date();
  const bookingRef = formatBookingDisplayId(input.bookingId, input.bookingCreatedAt);
  const letterRef = `POS-${bookingRef.replace(/^BK-/, '')}`;
  const project = display(input.projectName, 'the Project');
  const location = display(input.projectLocation, '—');
  const customer = display(input.customerName);
  const brand = resolveDeveloperTradeName(input.developerName);
  const signatory = String(input.authorizedSignatoryName ?? '').trim();
  const coBuyers = (input.coBuyerNames ?? []).filter(Boolean);
  const coBlock =
    coBuyers.length > 0
      ? `<p class="para"><strong>Co-allottee(s):</strong> ${coBuyers.map((n) => esc(n)).join(', ')}</p>`
      : '';
  const handoverDate = input.possessionDate
    ? formatPrintDate(new Date(input.possessionDate))
    : formatPrintDate(at);
  const ocRef = display(input.occupancyCertificateRef, `on file with ${brand}`);
  const contact = display(input.handoverContact, 'your relationship manager');
  const locationSuffix = location !== '—' ? ` at ${esc(location)}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Possession letter — ${esc(input.unitCode ?? bookingRef)}</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <div class="doc">
    ${brandHeaderHtml(input)}
    <p class="doc-title">Letter of possession</p>
    <div class="meta">
      <span><strong>Letter ref.:</strong> ${esc(letterRef)}</span>
      <span><strong>Date:</strong> ${esc(formatPrintDate(at))}</span>
    </div>
    <p class="para">To,</p>
    <p class="para">
      <strong>${esc(customer)}</strong>${coBuyers.length > 0 ? ` and co-allottee(s)` : ''}
    </p>
    ${coBlock}
    <p class="para">Subject: Offer of possession — Unit <strong>${esc(unitLine(input))}</strong>, ${esc(project)}${locationSuffix}.</p>
    <p class="para">Dear ${esc(customer)},</p>
    <p class="para">
      We are pleased to inform you that the construction of <strong>${esc(project)}</strong> is complete and the
      occupancy certificate (ref: <strong>${esc(ocRef)}</strong>) has been received from the competent authority.
      Your unit <strong>${esc(unitLine(input))}</strong> (booking ref: <strong>${esc(bookingRef)}</strong>) is now
      ready for possession with effect from <strong>${esc(handoverDate)}</strong>.
    </p>
    <p class="para"><strong>1. Dues and documents</strong></p>
    <p class="para">
      Please confirm that all instalments, applicable taxes, registration charges, maintenance corpus,
      and incidental dues have been paid in full. Original receipts, agreement, and registration documents
      should be carried for verification at the time of handover.
    </p>
    <p class="para"><strong>2. Inspection and snag list</strong></p>
    <p class="para">
      A joint inspection of the unit shall be conducted with our site team. Any snags noted shall be captured
      in the snag list and rectified by ${esc(brand)} as per the standard handover process.
    </p>
    <p class="para"><strong>3. Handover of keys</strong></p>
    <p class="para">
      Upon completion of the inspection and acceptance of the snag list, the keys, possession kit, and welcome
      letter shall be handed over to you. Please coordinate with <strong>${esc(contact)}</strong> to fix the
      handover date and time.
    </p>
    <p class="para"><strong>4. Maintenance</strong></p>
    <p class="para">
      Society / maintenance services shall commence from the date of possession. Maintenance charges and
      utility deposits shall be billed as per the agreed terms.
    </p>
    <p class="para">
      We thank you for trusting ${esc(brand)} and look forward to welcoming you to your new home.
    </p>
    <div class="sign-block">
      <p class="para">Yours sincerely,</p>
      <div class="sign-line">For ${esc(brand)} · ${esc(signatory || 'Authorised signatory')}</div>
    </div>
    <p class="muted">Generated: ${esc(formatPrintDate(at))} · Workflow: ${esc(display(input.workflowStage, '—'))}</p>
  </div>
</body>
</html>`;
}
