import { describe, expect, it } from 'vitest';
import { portalLinksSchema, userInviteSchema } from './user-invite.schema';

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('userInviteSchema', () => {
  const valid = {
    email: 'staff@example.com',
    name: 'Alex Staff',
    profileRole: 'Sales',
    projectMemberRole: 'Member',
    projectIds: [PROJECT_ID]
  };

  it('accepts minimal valid payload', () => {
    expect(userInviteSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(
      userInviteSchema.safeParse({ ...valid, email: 'not-an-email' }).success
    ).toBe(false);
  });

  it('rejects missing profile role', () => {
    expect(
      userInviteSchema.safeParse({ ...valid, profileRole: '' }).success
    ).toBe(false);
  });

  it('requires at least one project', () => {
    expect(
      userInviteSchema.safeParse({ ...valid, projectIds: [] }).success
    ).toBe(false);
  });
});

describe('portalLinksSchema', () => {
  it('accepts staff user with optional links', () => {
    expect(
      portalLinksSchema.safeParse({
        portalUserId: 'user-1',
        portalCustomerId: '',
        portalBrokerId: ''
      }).success
    ).toBe(true);
  });

  it('rejects missing staff user', () => {
    expect(
      portalLinksSchema.safeParse({
        portalUserId: '',
        portalCustomerId: '',
        portalBrokerId: ''
      }).success
    ).toBe(false);
  });

  it('rejects invalid customer UUID', () => {
    expect(
      portalLinksSchema.safeParse({
        portalUserId: 'user-1',
        portalCustomerId: 'not-a-uuid',
        portalBrokerId: ''
      }).success
    ).toBe(false);
  });
});
