import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

vi.mock('./nodemailer-email', () => ({
  sendSmtpEmail: vi.fn(async () => ({ ok: true }))
}));

import { sendSmtpEmail } from './nodemailer-email';
import {
  crmAbsoluteLink,
  notifyCrmUser,
  staffNotificationEmailHtml,
  staffNotificationFallbackEmails
} from './crm-staff-notification';

describe('staffNotificationFallbackEmails', () => {
  afterEach(() => {
    delete process.env.CRM_STAFF_NOTIFICATION_EMAIL;
    delete process.env.CRM_NEGOTIATION_APPROVAL_EMAIL;
  });

  it('returns empty list when env is unset', () => {
    expect(staffNotificationFallbackEmails()).toEqual([]);
  });

  it('parses comma-separated emails', () => {
    process.env.CRM_STAFF_NOTIFICATION_EMAIL =
      'Admin@Example.com, admin@example.com; ops@example.com';
    expect(staffNotificationFallbackEmails()).toEqual([
      'admin@example.com',
      'ops@example.com'
    ]);
  });

  it('falls back to negotiation approval email', () => {
    process.env.CRM_NEGOTIATION_APPROVAL_EMAIL = 'approvals@example.com';
    expect(staffNotificationFallbackEmails()).toEqual(['approvals@example.com']);
  });
});

describe('crmAbsoluteLink', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
  });

  it('prefixes path with app origin when configured', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://crm.example.com';
    expect(crmAbsoluteLink('/crm/inquiries')).toBe(
      'https://crm.example.com/crm/inquiries'
    );
  });

  it('returns relative path when origin is unavailable in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(crmAbsoluteLink('/crm/inquiries')).toBe('/crm/inquiries');
    process.env.NODE_ENV = prev;
  });
});

describe('staffNotificationEmailHtml', () => {
  it('includes title, body, and CTA when link is absolute', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://crm.example.com';
    const html = staffNotificationEmailHtml({
      title: 'Approval needed',
      body: 'Review negotiation request.',
      linkPath: '/crm/approvals'
    });
    expect(html).toContain('Approval needed');
    expect(html).toContain('Review negotiation request.');
    expect(html).toContain('https://crm.example.com/crm/approvals');
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
});

describe('notifyCrmUser', () => {
  it('returns error when user id is missing', async () => {
    const admin = {} as SupabaseClient;
    const result = await notifyCrmUser(admin, {
      userId: '',
      kind: 'test',
      title: 'T',
      body: 'B'
    });
    expect(result).toEqual({
      ok: false,
      inApp: false,
      emailSent: false,
      error: 'Missing user id'
    });
  });

  it('inserts notification and sends email when configured', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const getUserById = vi.fn(async () => ({
      data: { user: { email: 'staff@example.com' } },
      error: null
    }));
    const admin = {
      from: () => ({ insert }),
      auth: { admin: { getUserById } }
    } as unknown as SupabaseClient;

    const result = await notifyCrmUser(admin, {
      userId: 'user-1',
      kind: 'negotiation',
      title: 'Approval needed',
      body: 'Please review.',
      emailSubject: 'Approval needed',
      emailHtml: '<p>Please review.</p>'
    });

    expect(insert).toHaveBeenCalled();
    expect(sendSmtpEmail).toHaveBeenCalledWith({
      to: 'staff@example.com',
      subject: 'Approval needed',
      html: '<p>Please review.</p>'
    });
    expect(result.ok).toBe(true);
    expect(result.inApp).toBe(true);
    expect(result.emailSent).toBe(true);
  });
});
