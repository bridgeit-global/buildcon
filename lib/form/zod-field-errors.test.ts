import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodFieldErrors } from './zod-field-errors';

const schema = z.object({
  name: z.string().min(2, 'Name is too short.'),
  email: z.string().email('Invalid email.')
});

describe('zodFieldErrors', () => {
  it('returns empty object on success', () => {
    expect(zodFieldErrors(schema.safeParse({ name: 'Ravi', email: 'ravi@example.com' }))).toEqual(
      {}
    );
  });

  it('maps first issue per top-level field', () => {
    const errors = zodFieldErrors(
      schema.safeParse({ name: 'R', email: 'not-an-email' })
    );
    expect(errors.name).toBe('Name is too short.');
    expect(errors.email).toBe('Invalid email.');
  });

  it('ignores nested path segments beyond the first key', () => {
    const nested = z.object({
      address: z.object({ city: z.string().min(1, 'City required.') })
    });
    const errors = zodFieldErrors(nested.safeParse({ address: { city: '' } }));
    expect(errors.address).toBe('City required.');
  });

  it('keeps only the first error per field', () => {
    const multi = z.object({
      phone: z
        .string()
        .min(1, 'Phone required.')
        .regex(/^\d{10}$/, 'Phone must be 10 digits.')
    });
    const errors = zodFieldErrors(multi.safeParse({ phone: '' }));
    expect(errors.phone).toBe('Phone required.');
  });
});
