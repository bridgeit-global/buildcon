import type { ApplicationFormApplicantRow } from '@/lib/customer/application-form-data';

export type ApplicationFormPrintInput = {
  applicationFormNo?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  unitCode?: string | null;
  wingName?: string | null;
  floor?: number | null;
  unitType?: string | null;
  bookingAmount?: number | null;
  paymentMode?: string | null;
  loanFromBank?: boolean | null;
  preferredBank?: string | null;
  applicants: ApplicationFormApplicantRow[];
  generatedAt?: Date;
};

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applicantSection(a: ApplicationFormApplicantRow): string {
  const rows: [string, string][] = [
    ['Full name', a.fullName],
    ["Father's / mother's / spouse's name", a.guardianName],
    ['Date of birth', a.dob],
    ['PAN', a.pan],
    ['Aadhaar no.', a.aadhaar],
    ['Nationality', a.nationality],
    ['Residential status', a.residentialStatus],
    ['Profession', a.profession],
    ['Passport no. (NRI / foreign)', a.passportNo],
    ['Permanent address', a.permanentAddress],
    ['Mobile no.', a.mobile],
    ['Email', a.email],
    ['Address for communication', a.communicationAddress],
    ['Office name & address', a.officeNameAddress]
  ];
  const dl = rows
    .map(
      ([label, value]) =>
        `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`
    )
    .join('');
  return `
    <section class="applicant-block">
      <h3>${esc(a.role)}</h3>
      <p class="applicant-meta">Customer ID: ${esc(a.customerId)}</p>
      <dl>${dl}</dl>
    </section>`;
}

export function buildApplicationFormHtml(input: ApplicationFormPrintInput): string {
  const at = input.generatedAt ?? new Date();
  const applicantsHtml = input.applicants.map(applicantSection).join('');
  const tower = input.wingName ? esc(input.wingName) : '—';
  const floor =
    input.floor != null ? esc(String(input.floor)) : '—';
  const unitType = input.unitType ? esc(input.unitType) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Application form</title>
  <style>
    body { font-family: system-ui, sans-serif; color: #1e293b; margin: 24px; font-size: 12px; line-height: 1.45; }
    h1 { font-size: 17px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.02em; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #0f766e; margin: 20px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    h3 { font-size: 13px; margin: 0 0 4px; color: #0f172a; }
    .meta { color: #64748b; font-size: 11px; margin-bottom: 16px; }
    .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
    .header-grid dt { color: #64748b; font-size: 11px; }
    .header-grid dd { margin: 0; font-weight: 600; }
    section.unit dl { display: grid; grid-template-columns: 150px 1fr; gap: 5px 12px; margin: 0; }
    section.unit dt { color: #64748b; }
    section.unit dd { margin: 0; font-weight: 600; }
    .applicant-block { margin-bottom: 18px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; page-break-inside: avoid; }
    .applicant-meta { font-size: 10px; color: #64748b; margin: 0 0 8px; }
    .applicant-block dl { display: grid; grid-template-columns: 200px 1fr; gap: 4px 12px; margin: 0; }
    .applicant-block dt { color: #64748b; font-size: 11px; }
    .applicant-block dd { margin: 0; font-weight: 600; }
    .signatures { margin-top: 28px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .sig-box { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; color: #64748b; min-height: 48px; }
    .footnote { margin-top: 20px; font-size: 10px; color: #64748b; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>Application form</h1>
  <p class="meta">Sole / first, second and third applicant details (Section A — individual)</p>

  <dl class="header-grid">
    <dt>Application form no. / customer ID</dt>
    <dd>${esc(input.applicationFormNo ?? input.applicants[0]?.customerId ?? '—')}</dd>
    <dt>Date</dt>
    <dd>${esc(at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}</dd>
    <dt>Project</dt>
    <dd>${esc(input.projectName ?? '—')}</dd>
    <dt>Project location</dt>
    <dd>${esc(input.projectLocation ?? '—')}</dd>
  </dl>

  <section class="unit">
    <h2>Unit details (Section G — summary)</h2>
    <dl>
      <dt>Unit no.</dt><dd>${esc(input.unitCode ?? '—')}</dd>
      <dt>Floor</dt><dd>${floor}</dd>
      <dt>Tower / wing</dt><dd>${tower}</dd>
      <dt>Unit type</dt><dd>${unitType || '—'}</dd>
      <dt>Token / application amount</dt><dd>${input.bookingAmount != null ? `₹${Number(input.bookingAmount).toLocaleString('en-IN')}` : '—'}</dd>
      <dt>Mode of payment</dt><dd>${esc(input.paymentMode ?? '—')}</dd>
      <dt>Finance from bank</dt><dd>${input.loanFromBank ? 'Yes' : input.loanFromBank === false ? 'No' : '—'}</dd>
      <dt>Preferred financial institution</dt><dd>${esc(input.preferredBank ?? '—')}</dd>
    </dl>
  </section>

  <h2>A. Applicant details (individual)</h2>
  ${applicantsHtml || '<p>—</p>'}

  <div class="signatures">
    <div class="sig-box">Signature — 1st applicant</div>
    <div class="sig-box">Signature — 2nd applicant</div>
    <div class="sig-box">Signature — 3rd applicant</div>
  </div>

  <p class="footnote">Data is sourced from customer profiles (KYC, addresses, and application fields). PAN and Aadhaar values are masked on print. Attach passport-size photographs and document copies as per the standard application checklist.</p>
</body>
</html>`;
}

export function printApplicationForm(input: ApplicationFormPrintInput): void {
  const html = buildApplicationFormHtml(input);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Application form print preview');
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
