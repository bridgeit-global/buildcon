'use client';

import { useEffect, useMemo, useState } from 'react';
import { pageError } from '@/lib/toast';
import { unitEditSchema } from '@/lib/inventory/unit-edit.schema';
import { FormFieldError } from '@/components/ui/form-field-error';
import { TextInputField } from '@/components/ui/text-input-field';
import { useFieldValidation } from '@/lib/form/zod-field-errors';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { FormActions } from '@/components/ui/form-actions';
import { FormDrawer } from '@/components/ui/form-drawer';
import { FormRow } from '@/components/ui/form-row';
import { FormSection } from '@/components/ui/form-section';
import { FieldLabel } from '@/components/ui/field-label';
import {
  formControlClass,
  formControlFieldGapClass
} from '@/components/ui/form-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  isUnitBlockedStatus,
  STATUS_LABEL,
  UNIT_STATUS_CODES
} from '@/app/crm/inventory/inventory-utils';
import type { UnitRow } from '@/app/crm/inventory/inventory-list-table';
import { cn } from '@/lib/utils';

const FORM_ID = 'unit-edit-form';

export function UnitEditDrawer({
  unit,
  open,
  onOpenChange,
  onSaved,
  typeOptions,
  categoryOptions
}: {
  unit: UnitRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  typeOptions: string[];
  categoryOptions: string[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    unit_code: '',
    unit_type: '',
    unit_category: '',
    area: 0,
    carpet_area: 0,
    bua_area: 0,
    rera_area: 0,
    terrace_sqft: 0,
    deck_sqft: 0,
    loading_sqft: 0,
    rate: 0,
    floor_rise_charge: 0,
    plc_charge: 0,
    parking_slots_included: 0,
    floor: 1,
    unit_no: 1,
    status: 'AVAILABLE',
    blocked_reason: ''
  });

  useEffect(() => {
    if (!unit || !open) return;
    setForm({
      unit_code: unit.unit_code,
      unit_type: unit.unit_type ?? '',
      unit_category: unit.unit_category ?? '',
      area: Number(unit.area) || 0,
      carpet_area: Number(unit.carpet_area) || 0,
      bua_area: Number(unit.bua_area) || 0,
      rera_area: Number(unit.rera_area) || 0,
      terrace_sqft: Number(unit.terrace_sqft) || 0,
      deck_sqft: Number(unit.deck_sqft) || 0,
      loading_sqft: Number(unit.loading_sqft) || 0,
      rate: Number(unit.rate) || 0,
      floor_rise_charge: Number(unit.floor_rise_charge) || 0,
      plc_charge: Number(unit.plc_charge) || 0,
      parking_slots_included: Number(unit.parking_slots_included) || 0,
      floor: Number(unit.floor) || 1,
      unit_no: Number(unit.unit_no) || 1,
      status: unit.status,
      blocked_reason: unit.blocked_reason ?? ''
    });
  }, [unit, open]);

  const editValidation = useFieldValidation(unitEditSchema, {
    unit_code: form.unit_code,
    area: form.area,
    rate: form.rate,
    status: form.status,
    blocked_reason: form.blocked_reason
  });

  async function save() {
    if (!unit) return;
    const parsed = editValidation.validate();
    if (!parsed.success) {
      pageError('Fix the highlighted fields before saving.');
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      unit_code: form.unit_code.trim() || unit.unit_code,
      unit_type: form.unit_type || null,
      unit_category: form.unit_category || null,
      area: Math.max(1, Number(form.area) || 1),
      carpet_area:
        Number(form.carpet_area) > 0 ? Number(form.carpet_area) : null,
      bua_area: Number(form.bua_area) > 0 ? Number(form.bua_area) : null,
      rera_area: Number(form.rera_area) > 0 ? Number(form.rera_area) : null,
      terrace_sqft:
        Number(form.terrace_sqft) > 0 ? Number(form.terrace_sqft) : null,
      deck_sqft: Number(form.deck_sqft) > 0 ? Number(form.deck_sqft) : null,
      loading_sqft:
        Number(form.loading_sqft) > 0 ? Number(form.loading_sqft) : null,
      rate: Math.max(1, Number(form.rate) || 1),
      floor_rise_charge: Math.max(0, Number(form.floor_rise_charge) || 0),
      plc_charge: Math.max(0, Number(form.plc_charge) || 0),
      parking_slots_included: Math.max(
        0,
        Math.floor(Number(form.parking_slots_included) || 0)
      ),
      floor: Number(form.floor) || 1,
      unit_no: Math.max(1, Number(form.unit_no) || 1),
      status: form.status
    };
    if (isUnitBlockedStatus(form.status)) {
      payload.blocked_reason = form.blocked_reason || 'Other';
      payload.blocked_on = new Date().toISOString().slice(0, 10);
    } else {
      payload.blocked_reason = null;
      payload.blocked_on = null;
    }
    const { error } = await supabase.from('units').update(payload).eq('id', unit.id);
    setSaving(false);
    if (!error) {
      onSaved();
      onOpenChange(false);
    }
  }

  if (!unit) return null;

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Edit unit details"
      description={unit.unit_code}
      size="lg"
      footer={
        <FormActions
          onCancel={() => onOpenChange(false)}
          submitLabel="Save unit"
          saving={saving}
          submitType="button"
          onSubmitClick={() => void save()}
        />
      }
    >
      <form id={FORM_ID} className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        <FormSection title="Unit details" description="Identification and status.">
          <FormRow>
            <TextInputField
              label="Unit code"
              value={form.unit_code}
              onChange={(e) => {
                setForm((f) => ({ ...f, unit_code: e.target.value }));
                editValidation.touch('unit_code');
              }}
              onBlur={() => editValidation.touch('unit_code')}
              error={editValidation.fieldError('unit_code')}
            />
            <div>
              <FieldLabel>Unit type</FieldLabel>
              <SearchableSelect
                value={form.unit_type}
                onValueChange={(v) => setForm((f) => ({ ...f, unit_type: v }))}
                options={typeOptions}
                placeholder="Select type…"
                searchPlaceholder="Search type…"
                className={formControlFieldGapClass}
              />
            </div>
            <div>
              <FieldLabel>Category</FieldLabel>
              <SearchableSelect
                value={form.unit_category}
                onValueChange={(v) => setForm((f) => ({ ...f, unit_category: v }))}
                options={categoryOptions}
                placeholder="Select category…"
                searchPlaceholder="Search category…"
                className={formControlFieldGapClass}
              />
            </div>
            <div>
              <FieldLabel required>Status</FieldLabel>
              <Select
                value={form.status}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, status: v }));
                  editValidation.touch('status');
                }}
              >
                <SelectTrigger
                  className={cn(formControlFieldGapClass, formControlClass)}
                  aria-invalid={editValidation.fieldError('status') ? true : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_STATUS_CODES.map((k) => (
                    <SelectItem key={k} value={k}>
                      {STATUS_LABEL[k] ?? k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormFieldError message={editValidation.fieldError('status')} />
            </div>
            {isUnitBlockedStatus(form.status) ? (
              <TextInputField
                className="md:col-span-2"
                label="Blocked reason"
                value={form.blocked_reason}
                onChange={(e) => {
                  setForm((f) => ({ ...f, blocked_reason: e.target.value }));
                  editValidation.touch('blocked_reason');
                }}
                onBlur={() => editValidation.touch('blocked_reason')}
                error={editValidation.fieldError('blocked_reason')}
                placeholder="Reason for blocking"
              />
            ) : null}
          </FormRow>
        </FormSection>

        <FormSection title="Areas" description="All measurements in square feet.">
          <FormRow>
            <TextInputField
              label="Legacy / sale area"
              type="number"
              min={1}
              value={String(form.area)}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  area: Number(e.target.value) || 0
                }));
                editValidation.touch('area');
              }}
              onBlur={() => editValidation.touch('area')}
              error={editValidation.fieldError('area')}
            />
            <TextInputField
              label="Carpet"
              type="number"
              min={0}
              value={String(form.carpet_area || '')}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  carpet_area: Number(e.target.value) || 0
                }))
              }
            />
            <TextInputField
              label="BUA"
              type="number"
              min={0}
              value={String(form.bua_area || '')}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  bua_area: Number(e.target.value) || 0
                }))
              }
            />
            <TextInputField
              label="RERA"
              type="number"
              min={0}
              value={String(form.rera_area || '')}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  rera_area: Number(e.target.value) || 0
                }))
              }
            />
            <TextInputField
              label="Terrace"
              type="number"
              min={0}
              value={String(form.terrace_sqft || '')}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  terrace_sqft: Number(e.target.value) || 0
                }))
              }
            />
            <TextInputField
              label="Deck"
              type="number"
              min={0}
              value={String(form.deck_sqft || '')}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  deck_sqft: Number(e.target.value) || 0
                }))
              }
            />
            <TextInputField
              label="Loading"
              type="number"
              min={0}
              value={String(form.loading_sqft || '')}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  loading_sqft: Number(e.target.value) || 0
                }))
              }
            />
          </FormRow>
        </FormSection>

        <FormSection title="Pricing" description="Rates and lump-sum charges in INR.">
          <FormRow>
            <TextInputField
              label="Rate (₹/sq.ft)"
              type="number"
              min={1}
              value={String(form.rate)}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  rate: Number(e.target.value) || 0
                }));
                editValidation.touch('rate');
              }}
              onBlur={() => editValidation.touch('rate')}
              error={editValidation.fieldError('rate')}
            />
            <TextInputField
              label="Floor-rise (lump)"
              type="number"
              min={0}
              value={String(form.floor_rise_charge)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  floor_rise_charge: Number(e.target.value) || 0
                }))
              }
            />
            <TextInputField
              label="PLC (lump)"
              type="number"
              min={0}
              value={String(form.plc_charge)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  plc_charge: Number(e.target.value) || 0
                }))
              }
            />
            <TextInputField
              label="Parking slots (unit)"
              type="number"
              min={0}
              value={String(form.parking_slots_included)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  parking_slots_included: Number(e.target.value) || 0
                }))
              }
            />
          </FormRow>
        </FormSection>

        <FormSection title="Position" description="Floor and unit slot within the wing.">
          <FormRow>
            <TextInputField
              label="Floor"
              type="number"
              value={String(form.floor)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  floor: Number(e.target.value) || 0
                }))
              }
            />
            <TextInputField
              label="Unit slot"
              type="number"
              min={1}
              value={String(form.unit_no)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  unit_no: Number(e.target.value) || 1
                }))
              }
            />
          </FormRow>
        </FormSection>
      </form>
    </FormDrawer>
  );
}
