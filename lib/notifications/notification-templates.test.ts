import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEmailTemplateSpec,
  buildSmsPlainText,
  buildWhatsappTemplateSpec,
  getDocLabelForKind,
  type NotificationDocumentContext,
  type NotificationRecipient
} from './notification-templates';

const recipient: NotificationRecipient = {
  fullName: 'Ravi Kumar',
  email: 'ravi@example.com',
  phoneE164Digits: '919876543210'
};

const doc: NotificationDocumentContext = {
  kind: 'allotment-letter',
  docLabel: 'Allotment letter',
  signedUrl: 'https://example.com/doc.pdf',
  signedUrlValidDays: 7,
  fileName: 'allotment.pdf',
  unitCode: 'A-101',
  projectName: 'Sunrise Heights'
};

describe('buildSmsPlainText', () => {
  afterEach(() => {
    delete process.env.SMS_DOCUMENT_MESSAGE;
  });

  it('returns null when SMS_DOCUMENT_MESSAGE is unset', () => {
    expect(buildSmsPlainText(recipient, doc)).toBeNull();
  });

  it('substitutes placeholders when template is set', () => {
    process.env.SMS_DOCUMENT_MESSAGE =
      'Hi {name}, {doc} for unit {unit} at {project}: {url} ({days} days). Mobile {mobile}.';
    const text = buildSmsPlainText(recipient, doc);
    expect(text).toContain('Ravi Kumar');
    expect(text).toContain('Allotment letter');
    expect(text).toContain('A-101');
    expect(text).toContain('Sunrise Heights');
    expect(text).toContain('https://example.com/doc.pdf');
    expect(text).toContain('9876543210');
  });
});

describe('buildWhatsappTemplateSpec', () => {
  it('builds template with body params and header filename', () => {
    const spec = buildWhatsappTemplateSpec(recipient, doc);
    expect(spec.name).toBe('buildcon_application_form');
    expect(spec.bodyParams).toEqual([
      'Ravi Kumar',
      'Allotment letter',
      'A-101',
      '7'
    ]);
    expect(spec.headerFilename).toBe('allotment.pdf');
  });
});

describe('buildEmailTemplateSpec', () => {
  it('builds subject and escaped html', () => {
    const spec = buildEmailTemplateSpec(recipient, doc);
    expect(spec.subject).toBe('Allotment letter — ready to download');
    expect(spec.html).toContain('Ravi Kumar');
    expect(spec.html).toContain('A-101');
    expect(spec.html).toContain('Sunrise Heights');
    expect(spec.html).toContain('https://example.com/doc.pdf');
  });

  it('escapes html in customer name', () => {
    const spec = buildEmailTemplateSpec(
      { ...recipient, fullName: 'Ravi <script>' },
      doc
    );
    expect(spec.html).toContain('Ravi &lt;script&gt;');
    expect(spec.html).not.toContain('<script>');
  });
});

describe('getDocLabelForKind', () => {
  it('returns label for known kind', () => {
    expect(getDocLabelForKind('receipt')).toBeTruthy();
  });
});
