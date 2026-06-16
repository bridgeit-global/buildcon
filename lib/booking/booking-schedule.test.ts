import { describe, expect, it } from 'vitest';
import {
  balanceScheduleToSaleTotal,
  buildPaymentScheduleRows,
  cldStageDemandAmount,
  mergeScheduleWithSettledCollections,
  type CldStageRow,
  type PaymentScheduleInsertRow
} from '@/lib/booking/booking-schedule';

const bookingId = 'booking-1';

describe('cldStageDemandAmount', () => {
  const pctStage: CldStageRow = {
    sort_order: 2,
    name: 'Slab 2',
    demand_kind: 'percent',
    demand_value: 10,
    slab_label: null
  };

  it('uses booking amount for first instalment when provided', () => {
    expect(cldStageDemandAmount(pctStage, 10_000_000, 1, 250_000)).toBe(
      250_000
    );
  });

  it('uses fixed demand for fixed kind', () => {
    expect(
      cldStageDemandAmount(
        {
          sort_order: 1,
          name: 'Fixed',
          demand_kind: 'fixed',
          demand_value: 150_000,
          slab_label: null
        },
        10_000_000,
        2,
        250_000
      )
    ).toBe(150_000);
  });

  it('computes percent of agreement total', () => {
    expect(cldStageDemandAmount(pctStage, 10_000_000, 2, 0)).toBe(1_000_000);
  });
});

describe('buildPaymentScheduleRows', () => {
  it('builds fallback schedule when no CLD stages exist', () => {
    const rows = buildPaymentScheduleRows([], bookingId, 5_000_000, 500_000);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      instalment_no: 1,
      milestone: 'Booking Amount',
      amount: 500_000
    });
    expect(rows[1]).toMatchObject({
      instalment_no: 2,
      milestone: 'Pending Amount',
      amount: 4_500_000
    });
  });

  it('uses single booking row when sale total equals booking amount', () => {
    const rows = buildPaymentScheduleRows([], bookingId, 500_000, 500_000);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(500_000);
  });

  it('builds CLD rows sorted by sort_order', () => {
    const stages: CldStageRow[] = [
      {
        sort_order: 2,
        name: 'Second',
        demand_kind: 'percent',
        demand_value: 20,
        slab_label: null
      },
      {
        sort_order: 1,
        name: 'First',
        demand_kind: 'fixed',
        demand_value: 100_000,
        slab_label: 'A'
      }
    ];
    const rows = buildPaymentScheduleRows(stages, bookingId, 1_000_000, 100_000);
    expect(rows[0]?.instalment_no).toBe(1);
    expect(rows[0]?.milestone).toBe('Booking Amount');
    expect(rows[0]?.amount).toBe(100_000);
    expect(rows[1]?.milestone).toBe('Second');
    expect(rows[1]?.amount).toBe(200_000);
  });
});

describe('balanceScheduleToSaleTotal', () => {
  const baseRows: PaymentScheduleInsertRow[] = [
    {
      booking_id: bookingId,
      instalment_no: 1,
      milestone: 'Booking Amount',
      due_date: null,
      amount: 500_000
    },
    {
      booking_id: bookingId,
      instalment_no: 2,
      milestone: 'Pending Amount',
      due_date: null,
      amount: 4_000_000
    }
  ];

  it('returns rows unchanged when sum already matches sale total', () => {
    expect(balanceScheduleToSaleTotal(baseRows, 4_500_000, 500_000)).toEqual(
      baseRows
    );
  });

  it('adds remainder to pending row when sum is short', () => {
    const balanced = balanceScheduleToSaleTotal(baseRows, 5_000_000, 500_000);
    expect(balanced[1]?.amount).toBe(4_500_000);
  });

  it('trims excess from later instalments', () => {
    const rows = balanceScheduleToSaleTotal(baseRows, 4_000_000, 500_000);
    const sum = rows.reduce((s, r) => s + r.amount, 0);
    expect(sum).toBe(4_000_000);
    expect(rows[0]?.amount).toBe(500_000);
  });
});

describe('mergeScheduleWithSettledCollections', () => {
  const targetRows: PaymentScheduleInsertRow[] = [
    {
      booking_id: bookingId,
      instalment_no: 1,
      milestone: 'Booking Amount',
      due_date: null,
      amount: 500_000
    },
    {
      booking_id: bookingId,
      instalment_no: 2,
      milestone: 'Slab 1',
      due_date: null,
      amount: 2_000_000
    },
    {
      booking_id: bookingId,
      instalment_no: 3,
      milestone: 'Slab 2',
      due_date: null,
      amount: 2_500_000
    }
  ];

  it('preserves fully paid milestones and redistributes unpaid rows', () => {
    const merged = mergeScheduleWithSettledCollections(
      targetRows,
      [
        {
          id: 's1',
          instalment_no: 1,
          milestone: 'Booking Amount',
          due_date: '2026-01-01',
          amount: 500_000
        },
        {
          id: 's2',
          instalment_no: 2,
          milestone: 'Slab 1',
          due_date: null,
          amount: 2_000_000
        }
      ],
      { s1: 500_000, s2: 500_000 },
      5_000_000
    );

    expect(merged).toHaveLength(3);
    expect(merged[0]?.amount).toBe(500_000);
    expect(merged[1]?.amount).toBeGreaterThanOrEqual(500_000);
    expect(merged.reduce((s, r) => s + r.amount, 0)).toBe(5_000_000);
  });

  it('returns target rows when there are no flexible unpaid rows', () => {
    const merged = mergeScheduleWithSettledCollections(
      targetRows.slice(0, 1),
      [
        {
          id: 's1',
          instalment_no: 1,
          milestone: 'Booking Amount',
          due_date: null,
          amount: 500_000
        }
      ],
      { s1: 500_000 },
      500_000
    );
    expect(merged).toEqual([
      {
        ...targetRows[0]!,
        amount: 500_000,
        due_date: null
      }
    ]);
  });
});
