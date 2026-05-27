import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CldStageWithId } from '@/lib/booking/booking-schedule';
import {
  cldInstalmentNoForStage,
  cldMilestoneLabel,
  loadProjectCldStages
} from '@/lib/booking/booking-schedule';
import { loadBookingPrintPack } from '@/lib/booking/load-booking-print-pack';
import { persistGeneratedBookingDocumentServer } from '@/lib/booking/persist-generated-booking-document-server';
import { generatedDemandExistsForSchedule } from '@/lib/booking/booking-generated-doc-kind';
import {
  isUnitPossessedStatus,
  unitStatusFromBookingUnitsJoin
} from '@/app/crm/inventory/unit-status';
export type GenerateCldDemandLettersResult = {
  demandLettersGenerated: number;
  demandLettersSkipped: number;
  notificationsPending: number;
  errors: string[];
};

/** After CLD stage completion: one demand PDF per confirmed booking for that instalment. */
export async function generateCldDemandLettersForProject(
  admin: SupabaseClient,
  opts: {
    projectId: string;
    stage: CldStageWithId;
    generatedBy?: string | null;
  }
): Promise<GenerateCldDemandLettersResult> {
  const stages = await loadProjectCldStages(admin, opts.projectId);
  const instalmentNo = cldInstalmentNoForStage(stages, opts.stage.id);
  if (instalmentNo == null) {
    return {
      demandLettersGenerated: 0,
      demandLettersSkipped: 0,
      notificationsPending: 0,
      errors: ['CLD stage not found for this project']
    };
  }

  const milestone = cldMilestoneLabel(opts.stage);

  const { data: bookings, error: bErr } = await admin
    .from('bookings')
    .select('id,units(status)')
    .eq('project_id', opts.projectId)
    .eq('workflow_stage', 'confirmation')
    .neq('status', 'cancelled');

  if (bErr) {
    return {
      demandLettersGenerated: 0,
      demandLettersSkipped: 0,
      notificationsPending: 0,
      errors: [bErr.message]
    };
  }

  let demandLettersGenerated = 0;
  let demandLettersSkipped = 0;
  const errors: string[] = [];

  for (const booking of bookings ?? []) {
    const bookingId = booking.id as string;

    if (
      isUnitPossessedStatus(
        unitStatusFromBookingUnitsJoin(
          booking.units as { status: string } | { status: string }[] | null
        )
      )
    ) {
      demandLettersSkipped += 1;
      continue;
    }

    const { data: schedule, error: sErr } = await admin
      .from('payment_schedules')
      .select('id,instalment_no,milestone,due_date,amount')
      .eq('booking_id', bookingId)
      .eq('instalment_no', instalmentNo)
      .maybeSingle();

    if (sErr) {
      errors.push(`${bookingId}: ${sErr.message}`);
      continue;
    }
    if (!schedule?.id) {
      demandLettersSkipped += 1;
      continue;
    }

    const scheduleId = schedule.id as string;
    const amount = Number(schedule.amount || 0);

    const { data: cols } = await admin
      .from('collections')
      .select('received_amount')
      .eq('schedule_id', scheduleId);

    const received = (cols ?? []).reduce(
      (sum, row) => sum + Number(row.received_amount ?? 0),
      0
    );
    const pending = Math.max(0, amount - received);
    if (pending <= 0) {
      demandLettersSkipped += 1;
      continue;
    }

    const { data: existing } = await admin
      .from('generated_documents')
      .select('storage_path')
      .eq('booking_id', bookingId)
      .limit(200);

    if (
      generatedDemandExistsForSchedule(
        (existing ?? []) as { storage_path: string }[],
        scheduleId
      )
    ) {
      demandLettersSkipped += 1;
      continue;
    }

    const packRes = await loadBookingPrintPack(admin, bookingId);
    if (!packRes.ok) {
      errors.push(`${bookingId}: ${packRes.error}`);
      continue;
    }

    const persisted = await persistGeneratedBookingDocumentServer(
      admin,
      packRes.pack,
      'demand-letter',
      {
        linkId: scheduleId,
        generatedBy: opts.generatedBy ?? null,
        htmlOverrides: {
          instalmentLabel: `${schedule.instalment_no}. ${schedule.milestone ?? milestone}`,
          demandAmount: pending,
          demandDueDate: (schedule.due_date as string | null) ?? null
        }
      }
    );

    if (!persisted.ok) {
      errors.push(`${bookingId}: ${persisted.error}`);
      continue;
    }

    demandLettersGenerated += 1;
  }

  return {
    demandLettersGenerated,
    demandLettersSkipped,
    notificationsPending: demandLettersGenerated,
    errors
  };
}
