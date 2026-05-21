import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Meta Webhook verification (subscribe handshake). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'WhatsApp webhook verify token not configured.' },
      { status: 500 }
    );
  }
  if (mode === 'subscribe' && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

type WhatsappStatus = {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: Array<{ message?: string; title?: string }>;
};

type WhatsappEntry = {
  changes?: Array<{
    value?: {
      statuses?: WhatsappStatus[];
    };
  }>;
};

type WhatsappWebhookBody = {
  entry?: WhatsappEntry[];
};

/** Delivery status callbacks: update outbound_notifications by provider_message_id. */
export async function POST(request: Request) {
  let body: WhatsappWebhookBody;
  try {
    body = (await request.json()) as WhatsappWebhookBody;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const statuses: WhatsappStatus[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        statuses.push(s);
      }
    }
  }

  if (statuses.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const admin = createSupabaseAdminClient();
  for (const s of statuses) {
    if (!s.id || !s.status) continue;
    const next = mapStatus(s.status);
    if (!next) continue;
    const errMsg =
      Array.isArray(s.errors) && s.errors.length > 0
        ? s.errors
            .map((e) => e?.message ?? e?.title)
            .filter(Boolean)
            .join('; ')
        : null;
    await admin
      .from('outbound_notifications')
      .update({
        status: next,
        error: errMsg ?? null,
        processed_at: new Date().toISOString()
      })
      .eq('provider_message_id', s.id);
  }

  return NextResponse.json({ ok: true });
}

function mapStatus(
  raw: string
): 'sent' | 'delivered' | 'read' | 'failed' | null {
  const s = raw.toLowerCase();
  if (s === 'sent') return 'sent';
  if (s === 'delivered') return 'delivered';
  if (s === 'read') return 'read';
  if (s === 'failed' || s === 'undelivered') return 'failed';
  return null;
}
