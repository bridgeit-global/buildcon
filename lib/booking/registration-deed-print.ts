import { formatBookingDisplayId } from '@/lib/booking/allotment-letter-print';
import {
  display,
  esc,
  formatInr,
  formatPrintDate,
  sharedStyles,
  unitLine,
  type BookingSalesDocPrintBase
} from '@/lib/booking/booking-receipt-demand-agreement-print';

export type RegistrationDeedInput = BookingSalesDocPrintBase & {
  registrationDate?: string | null;
  subRegistrarOffice?: string | null;
  documentNumber?: string | null;
};

export function buildRegistrationDeedHtml(input: RegistrationDeedInput): string {
  const at = input.generatedAt ?? new Date();
  const bookingRef = formatBookingDisplayId(input.bookingId, input.bookingCreatedAt);
  const deedRef =
    input.documentNumber?.trim() || `REG-${bookingRef.replace(/^BK-/, '')}`;
  const project = display(input.projectName, 'the Project');
  const location = display(input.projectLocation, '—');
  const customer = display(input.customerName);
  const coBuyers = (input.coBuyerNames ?? []).filter(Boolean);
  const coBlock =
    coBuyers.length > 0
      ? `<p class="para"><strong>Co-applicant(s):</strong> ${coBuyers.map((n) => esc(n)).join(', ')}</p>`
      : '';
  const registrationDate = input.registrationDate
    ? formatPrintDate(new Date(input.registrationDate))
    : formatPrintDate(at);
  const sro = display(input.subRegistrarOffice, 'the office of the Sub-Registrar of Assurances');
  const locationSuffix = location !== '—' ? ` situated at ${esc(location)}` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Registration deed — ${esc(input.unitCode ?? bookingRef)}</title>
  <style>${sharedStyles()}</style>
</head>
<body>
  <div class="doc">
    <p class="brand">BuildCon</p>
    <p class="doc-title">Registration deed (record copy)</p>
    <div class="meta">
      <span><strong>Deed ref.:</strong> ${esc(deedRef)}</span>
      <span><strong>Registration date:</strong> ${esc(registrationDate)}</span>
    </div>
    <p class="para">
      This deed is generated for record-keeping by BuildCon CRM following the registration of the apartment /
      unit described below at <strong>${esc(sro)}</strong>.
    </p>
    <p class="para"><strong>Between</strong></p>
    <p class="para">
      <strong>BuildCon</strong>, developer of the residential project known as <strong>${esc(project)}</strong>${locationSuffix}
      (hereinafter called the &quot;Developer&quot; / &quot;Vendor&quot;),
    </p>
    <p class="para"><strong>And</strong></p>
    <p class="para">
      <strong>${esc(customer)}</strong> (hereinafter called the &quot;Purchaser&quot;).
    </p>
    ${coBlock}
    <p class="para"><strong>1. Property registered</strong></p>
    <p class="para">
      The apartment / unit identified as <strong>${esc(unitLine(input))}</strong> in <strong>${esc(project)}</strong>,
      together with the proportionate undivided right in the common areas and amenities, has been transferred
      to the Purchaser by way of a registered sale deed.
    </p>
    <p class="para"><strong>2. Consideration received</strong></p>
    <p class="para">
      Booking reference: <strong>${esc(bookingRef)}</strong>. The full sale consideration, applicable taxes,
      stamp duty, and registration charges have been paid by the Purchaser as recorded in the registered
      instrument. Booking amount on record: <strong>${esc(formatInr(input.bookingAmount))}</strong>.
    </p>
    <p class="para"><strong>3. Possession</strong></p>
    <p class="para">
      Possession of the said unit shall be handed over by the Developer to the Purchaser upon completion of
      the prescribed inspection, snag rectification, and handover formalities of the project, subject to
      receipt of all dues.
    </p>
    <p class="para"><strong>4. Records</strong></p>
    <p class="para">
      This record copy is retained by BuildCon for customer relationship and after-sales servicing. The
      registered original deed shall prevail in case of any discrepancy.
    </p>
    <div class="sign-block">
      <table class="details" style="margin-top: 8px;">
        <tbody>
          <tr>
            <th style="width:50%">For BuildCon (Developer)</th>
            <th style="width:50%">Purchaser</th>
          </tr>
          <tr>
            <td style="height: 72px; vertical-align: bottom;">Authorised signatory</td>
            <td style="height: 72px; vertical-align: bottom;">Signature</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted">Generated: ${esc(formatPrintDate(at))} · Workflow: ${esc(display(input.workflowStage, '—'))}</p>
  </div>
</body>
</html>`;
}
