import { describe, expect, it } from 'vitest';
import { cldStageSchema } from './cld-stage.schema';

describe('cldStageSchema', () => {
  it('accepts stage name', () => {
    expect(cldStageSchema.safeParse({ name: 'Slab completion' }).success).toBe(
      true
    );
  });

  it('rejects empty stage name', () => {
    expect(cldStageSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects whitespace-only name', () => {
    expect(cldStageSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});
