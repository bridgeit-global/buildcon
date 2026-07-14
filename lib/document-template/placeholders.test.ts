import { describe, expect, it } from 'vitest';
import {
  applyDocumentTemplatePlaceholders,
  DOCUMENT_TEMPLATE_PLACEHOLDERS
} from '@/lib/document-template/placeholders';
import { documentTemplateFormSchema } from '@/lib/document-template/document-template.schema';
import { DOCUMENT_TEMPLATE_SAMPLES } from '@/lib/document-template/sample-templates';
import { DOCUMENT_TEMPLATE_KINDS } from '@/lib/document-template/kinds';

describe('applyDocumentTemplatePlaceholders', () => {
  it('replaces known keys and leaves unknown keys intact', () => {
    const html =
      '<p>{{customer.name}} — {{unit.code}} — {{missing.key}}</p>';
    const out = applyDocumentTemplatePlaceholders(html, {
      'customer.name': 'Ada',
      'unit.code': 'A-101'
    });
    expect(out).toBe('<p>Ada — A-101 — {{missing.key}}</p>');
  });

  it('trims whitespace inside braces', () => {
    const out = applyDocumentTemplatePlaceholders('Hi {{ customer.name }}', {
      'customer.name': 'Bob'
    });
    expect(out).toBe('Hi Bob');
  });
});

describe('documentTemplateFormSchema', () => {
  it('accepts a valid template', () => {
    const parsed = documentTemplateFormSchema.safeParse({
      doc_kind: 'demand-letter',
      name: 'Demand letter',
      body: '<html>{{demand.amount_inr}}</html>',
      is_active: true
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty body', () => {
    const parsed = documentTemplateFormSchema.safeParse({
      doc_kind: 'agreement',
      name: 'Agreement',
      body: '   ',
      is_active: true
    });
    expect(parsed.success).toBe(false);
  });
});

describe('sample templates', () => {
  it('covers every uploadable kind and uses at least one placeholder', () => {
    for (const kind of DOCUMENT_TEMPLATE_KINDS) {
      const html = DOCUMENT_TEMPLATE_SAMPLES[kind];
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toMatch(/\{\{[a-zA-Z0-9_.]+\}\}/);
    }
  });

  it('documents a non-empty placeholder catalog', () => {
    expect(DOCUMENT_TEMPLATE_PLACEHOLDERS.length).toBeGreaterThan(10);
  });
});
