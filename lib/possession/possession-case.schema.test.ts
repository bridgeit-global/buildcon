import { describe, expect, it } from 'vitest';
import { possessionSnagSchema } from './possession-case.schema';

describe('possessionSnagSchema', () => {
  it('accepts snag description', () => {
    expect(
      possessionSnagSchema.safeParse({ description: 'Crack in bedroom wall' })
        .success
    ).toBe(true);
  });

  it('rejects empty description', () => {
    expect(possessionSnagSchema.safeParse({ description: '' }).success).toBe(
      false
    );
  });
});
