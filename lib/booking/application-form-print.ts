import type { ApplicationFormApplicantRow } from '@/lib/customer/application-form-data';
import DOCX_PARAS from '@/lib/booking/application-form-docx-paras.json';
import { PRINT_FONT_FAMILY } from '@/lib/booking/print-font-family';
import { formatDisplayDate } from '@/lib/format-display-date';

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
  tokenDate?: string | null;
  tokenReference?: string | null;
  loanFromBank?: boolean | null;
  preferredBank?: string | null;
  applicants: ApplicationFormApplicantRow[];
  /** Base64 data-URI or URL for each applicant's passport photo (indexed 0–2). */
  applicantPhotoUrls?: (string | null)[];
  generatedAt?: Date;
};

const SECTION_HEADER_INDICES = new Set([
  10, 11, 46, 61, 69, 73, 77, 81, 84, 120, 151, 159, 201, 230, 271, 307, 325, 341
]);

const CENTER_TITLE_INDICES = new Set([0]);
const CENTER_SUBTITLE_INDICES = new Set([1]);
const SKIP_INDICES = new Set([2, 7, 8, 9]);

/** Docx blank line immediately after a label — filled with 1st / 2nd / 3rd applicant values */
const APPLICANT_ANSWER_LINE: Record<
  number,
  (a: ApplicationFormApplicantRow) => string
> = {
  14: (a) => a.fullName.toUpperCase(),
  16: (a) => a.guardianName,
  18: (a) => a.dob,
  20: (a) => a.pan,
  22: (a) => a.aadhaar,
  24: (a) => a.nationality,
  26: (a) => a.residentialStatus,
  28: (a) => a.profession,
  30: (a) => a.passportNo,
  32: (a) => a.permanentAddress,
  33: (a) => a.permanentAddress,
  35: (a) => a.mobile,
  37: (a) => a.email,
  39: (a) => a.communicationAddress,
  41: (a) => a.officeNameAddress
};

const SIGNATURE_ANSWER_LINE: Record<number, number> = {
  124: 0,
  126: 1,
  128: 2
};

const COMPANY_BLANK_LINES = new Set([48, 50, 52, 54, 55, 57, 63, 65, 67, 80, 94, 96, 98]);

const UNIT_AREA_BLANK_LINES = new Set([94, 96, 98]);

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function display(v: string | null | undefined, fallback = ''): string {
  const s = String(v ?? '').trim();
  if (!s || s === '—') return fallback;
  return s;
}

function formatInr(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return '';
  return Number(amount).toLocaleString('en-IN');
}

function formatDate(d: Date): string {
  return formatDisplayDate(d);
}

function formatTokenDate(raw: string | null | undefined, fallback: Date): string {
  const s = String(raw ?? '').trim();
  if (!s) return formatDate(fallback);
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  return formatDate(d);
}

function applicantTriple(
  applicants: ApplicationFormApplicantRow[],
  pick: (a: ApplicationFormApplicantRow) => string
): string {
  const cells = [0, 1, 2].map((i) => {
    const a = applicants[i];
    const v = a ? display(pick(a)) : '';
    return `<span class="fill-cell">${v ? esc(v) : '&nbsp;'}</span>`;
  });
  return `<p class="fill-row">${cells.join('')}</p>`;
}

function singleFillLine(value: string | null | undefined): string {
  const v = display(value);
  return `<p class="fill-row single"><span class="fill-cell">${v ? esc(v) : '&nbsp;'}</span></p>`;
}

function normalizePaymentMode(mode: string | null | undefined): string {
  return String(mode ?? '')
    .trim()
    .toLowerCase();
}

function paymentModeLine(
  index: number,
  text: string,
  mode: string | null | undefined
): string {
  const m = normalizePaymentMode(mode);
  const matches = (keywords: string[]) =>
    keywords.some((k) => m.includes(k));
  const mark = (on: boolean) => (on ? '☑' : '☐');
  const blank = (on: boolean) => (on && m ? esc(mode!) : '__________');

  if (index === 74) {
    const on = matches(['cheque', 'check']);
    return `${mark(on)} Cheque ${blank(on)}`;
  }
  if (index === 75) {
    const on = matches(['draft', 'p.o', 'po', 'demand']);
    return `${mark(on)} Draft / P.O. ${blank(on)}`;
  }
  if (index === 76) {
    const on = matches(['rtgs', 'neft', 'upi', 'transfer', 'online']);
    return `${mark(on)} RTGS/NEFT ${blank(on)}`;
  }
  return esc(text);
}

function paraClass(index: number): string {
  if (CENTER_TITLE_INDICES.has(index)) return 'title-main';
  if (CENTER_SUBTITLE_INDICES.has(index)) return 'title-sub';
  if (SECTION_HEADER_INDICES.has(index)) return 'section-header';
  if (index === 42 || index === 43) return 'note';
  if (index >= 108 && index <= 110) return 'footnote';
  if (index === 159) return 'annexure-title';
  return 'para';
}

function textToHtml(text: string): string {
  return esc(text).replace(/\n/g, '<br>');
}

function renderPhotoRow(photoUrls?: (string | null)[]): string {
  const labels = ['Photo of Sole/First Applicant', 'Photo of Second Applicant', 'Photo of Third Applicant'];
  const boxes = [0, 1, 2].map((i) => {
    const url = photoUrls?.[i];
    const inner = url
      ? `<img src="${esc(url)}" alt="${labels[i]}" class="photo-img" />`
      : '';
    return `<div class="photo-box">${inner}</div>`;
  });
  return `<div class="photo-row">
    <div class="photo-label">${labels[0]}</div>
    <div class="photo-label">${labels[1]}</div>
    <div class="photo-label">${labels[2]}</div>
  </div>
  <div class="photo-row">
    ${boxes.join('\n    ')}
  </div>`;
}

function renderParagraph(
  index: number,
  text: string,
  input: ApplicationFormPrintInput
): string {
  const at = input.generatedAt ?? new Date();
  const dateStr = formatDate(at);
  const tokenDateStr = formatTokenDate(input.tokenDate, at);
  const applicants = input.applicants;
  const formNo = display(
    input.applicationFormNo ?? applicants[0]?.customerId,
    '_______________'
  );
  const project = display(input.projectName, '________');
  const location = display(input.projectLocation, '_________________________');
  const amountNum = formatInr(input.bookingAmount);
  const amount = amountNum ? `₹${amountNum}` : '';
  const unit = display(input.unitCode, '_____');
  const floor =
    input.floor != null ? String(input.floor) : '_____';
  const tower = display(input.wingName, '_____');
  const tokenRef = display(input.tokenReference);

  if (index === 6) {
    const first = applicants[0];
    const name = first ? display(first.fullName) : '';
    const addr = first ? display(first.communicationAddress) : '';
    return `<p class="para">To,<br><span class="filled">${esc(name || '_______________________')}</span><br><span class="filled">${esc(addr || '_______________________')}</span></p>`;
  }

  if (index === 12) {
    return `<p class="fill-row applicant-col-headers"><span class="fill-cell col-header">1st Applicant</span><span class="fill-cell col-header">2nd Applicant</span><span class="fill-cell col-header">3rd Applicant</span></p>`;
  }

  if (index === 3) {
    const body = text
      .replace('“________”', `“${project}”`)
      .replace('_________________________', location);
    return `<p class="para">${esc(body)}</p>`;
  }

  if (index === 4) {
    return `<p class="para">Application Form No./ Customer ID: <span class="filled">${esc(formNo)}</span> Date: <span class="filled">${esc(dateStr)}</span></p>`;
  }

  if (index === 5) return renderPhotoRow(input.applicantPhotoUrls);

  if (index === 70) {
    const yes = input.loanFromBank === true;
    const no = input.loanFromBank === false;
    return `<p class="para">Yes ${yes ? '☑' : '☐'} / No ${no ? '☑' : '☐'}.</p>`;
  }

  if (index === 71) {
    const bank = display(input.preferredBank);
    return `<p class="para">If yes, Preferred Financial Institution: <span class="filled">${esc(bank)}</span></p>`;
  }

  if (index === 74 || index === 75 || index === 76) {
    return `<p class="para">${paymentModeLine(index, text, input.paymentMode)}</p>`;
  }

  if (index === 87) {
    return `<p class="para">Unit No. <span class="filled">${esc(unit)}</span></p>`;
  }
  if (index === 88) {
    return `<p class="para">Floor <span class="filled">${esc(floor)}</span></p>`;
  }
  if (index === 89) {
    return `<p class="para">Tower <span class="filled">${esc(tower)}</span></p>`;
  }

  if (index === 115) {
    const amt = amount || '[________________]';
    return `<p class="para">I/we, agree to pay the cost of property for the Unit which is Rs. <span class="filled">${esc(amt)}</span></p>`;
  }

  if (index === 116) {
    const rupees = amount
      ? `${amount} only`
      : '[______________________________________________] only';
    return `<p class="para">(Rupees <span class="filled">${esc(rupees)}</span>)(“Cost of Property”) details whereof and other charges payable by the Applicant(s) for transfer of the Unit in its favour, are mentioned in Annexure E (“Payment Plan”).</p>`;
  }

  if (index === 129 || index === 157) {
    return `<p class="para">Date <span class="filled">${esc(dateStr)}</span></p>`;
  }

  if (index === 309 || index === 327) {
    return `<p class="para">Date: <span class="filled">${esc(tokenDateStr)}</span></p>`;
  }

  if (index === 130 || index === 158) {
    return `<p class="para">Place <span class="filled">&nbsp;</span></p>`;
  }

  if (index === 72) {
    return singleFillLine(display(input.preferredBank));
  }

  if (index === 148) {
    const ref = tokenRef || '___________________';
    const dt = tokenDateStr || '______________';
    const amt = amount || '___________________';
    return `<p class="para">(i) Cheque/Demand Draft No. <span class="filled">${esc(ref)}</span> dated <span class="filled">${esc(dt)}</span> in favour of“__________________________________________________”<br>
drawn on __________________ Bank,<br>
________________ Branch and have paid a sum of<br>
Rs. <span class="filled">${esc(amt)}</span></p>`;
  }

  if (index === 150) {
    const ref = tokenRef || '________________';
    const amt = amount || '___________________';
    return `<p class="para">(ii) NEFT/RTGS/Debit Card/Credit Card bearing transaction reference no.<span class="filled">${esc(ref)}</span> dated <span class="filled">${esc(tokenDateStr)}</span> for a sum of<br>
Rs. <span class="filled">${esc(amt)}</span> /-<br>
(Rupees <span class="filled">${esc(amount ? `${amount} only` : '__________________________________________')}</span>)<br>
(“Application Money”) as part of Booking Amount payable by me as per terms of this Application.</p>`;
  }

  if (index === 154) {
    const n0 = display(applicants[0]?.fullName);
    const n1 = display(applicants[1]?.fullName);
    const n2 = display(applicants[2]?.fullName);
    return `<p class="para">Signature of First Applicant(s) <span class="filled">${esc(n0 || '____________________________')}</span></p>
<p class="para">Signature of Second Applicant(s) <span class="filled">${esc(n1 || '____________________________')}</span></p>
<p class="para">Signature of Third Applicant(s) <span class="filled">${esc(n2 || '____________________________')}</span></p>`;
  }

  if (index === 111) {
    let body = text;
    body = body.replace(
      /by the name of “_________________”/,
      `by the name of “${project}”`
    );
    body = body.replace(
      /situated at _________________ \(“Project Land”\)/,
      `situated at ${location} (“Project Land”)`
    );
    return `<p class="para">${textToHtml(body)}</p>`;
  }

  if (index === 312) {
    return `<p class="para">I/We have submitted my/our application form with Application Money for booking the Unit No. <span class="filled">${esc(unit)}</span> in the project <span class="filled">${esc(project)}</span> being developed by ______.</p>`;
  }

  if (index === 321) {
    return `<p class="para">Unit No. Applied: <span class="filled">${esc(unit)}</span></p>`;
  }

  if (index === 322) {
    return `<p class="para">Project Name: <span class="filled">${esc(project)}</span></p>`;
  }

  if (index === 331) {
    return `<p class="para">Sub: Purchase of Unit No <span class="filled">${esc(unit)}</span> in the project <span class="filled">${esc(project)}</span> being developed by ____________.</p>`;
  }

  const cls = paraClass(index);
  const trimmed = text.trim();
  if (!trimmed) return '';

  return `<p class="${cls}">${textToHtml(text)}</p>`;
}

export function buildApplicationFormHtml(input: ApplicationFormPrintInput): string {
  const bodyParts: string[] = [];

  for (const { i, t } of DOCX_PARAS as { i: number; t: string }[]) {
    if (SKIP_INDICES.has(i)) continue;

    if (i in SIGNATURE_ANSWER_LINE) {
      const slot = SIGNATURE_ANSWER_LINE[i]!;
      const name = display(input.applicants[slot]?.fullName);
      bodyParts.push(singleFillLine(name));
      continue;
    }

    if (i in APPLICANT_ANSWER_LINE) {
      bodyParts.push(
        applicantTriple(input.applicants, APPLICANT_ANSWER_LINE[i]!)
      );
      continue;
    }

    if (COMPANY_BLANK_LINES.has(i) || UNIT_AREA_BLANK_LINES.has(i)) {
      bodyParts.push(singleFillLine(''));
      continue;
    }

    if (i === 154) {
      bodyParts.push(renderParagraph(i, t, input));
      continue;
    }

    if (i === 155 || i === 156) continue;

    const html = renderParagraph(i, t, input);
    if (html) bodyParts.push(html);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Application form</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: ${PRINT_FONT_FAMILY};
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
      margin: 0;
      padding: 0;
    }
    .title-main {
      text-align: center;
      font-weight: 700;
      font-size: 14pt;
      margin: 0 0 4px;
      text-transform: uppercase;
    }
    .title-sub {
      text-align: center;
      font-size: 10pt;
      margin: 0 0 12px;
    }
    .section-header {
      font-weight: 700;
      margin: 12px 0 4px;
    }
    .annexure-title {
      font-weight: 700;
      text-transform: uppercase;
      margin: 20px 0 8px;
      page-break-before: always;
    }
    .para { margin: 0 0 5px; text-align: justify; }
    .note, .footnote { font-size: 10pt; margin: 6px 0; text-align: justify; }
    .filled {
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .fill-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin: 0 0 6px;
      min-height: 20px;
      align-items: end;
    }
    .fill-row.single { grid-template-columns: 1fr; }
    .fill-cell {
      display: block;
      border-bottom: 1px solid #000;
      min-height: 18px;
      padding: 0 2px 2px;
      font-weight: 600;
      font-size: 11pt;
      line-height: 1.3;
      word-break: break-word;
    }
    .applicant-col-headers { margin-bottom: 2px; }
    .col-header {
      font-weight: 700;
      font-size: 10pt;
      text-align: center;
      border-bottom: none;
    }
    .photo-label { text-align: center; font-size: 9pt; }
    .photo-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin: 0 0 4px;
    }
    .photo-box {
      border: 1px solid #000;
      height: 110px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .photo-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    @media print {
      .annexure-title { page-break-before: always; }
      .fill-row { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
${bodyParts.join('\n')}
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
