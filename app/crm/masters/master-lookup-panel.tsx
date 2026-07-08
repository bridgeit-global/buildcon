'use client';

import { useMemo, useState } from 'react';
import { pageError, toast } from '@/lib/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  MASTER_LOOKUP_KIND_LABELS,
  type MasterLookupItem,
  type MasterLookupKind
} from '@/lib/master/master-lookup';
import {
  masterLookupFormSchema,
  masterLookupFormPayload
} from '@/lib/master/master-lookup.schema';
import { useMasterLookup } from '@/lib/master/use-master-lookup';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CrmTableBodySkeleton } from '../_components/crm-skeletons';
import { StatusChip } from '@/components/ui/status-chip';
import { Pencil, Trash2, Check, X } from 'lucide-react';

export function MasterLookupPanel({ kind }: { kind: MasterLookupKind }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { items, loading, reload } = useMasterLookup(kind, {
    includeInactive: true
  });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSortOrder, setEditSortOrder] = useState('0');

  const nextSortOrder = useMemo(() => {
    if (!items.length) return 0;
    return items.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
  }, [items]);

  async function addItem() {
    const parsed = masterLookupFormSchema.safeParse({
      kind,
      name,
      sort_order: nextSortOrder,
      is_active: true
    });
    if (!parsed.success) {
      pageError(parsed.error.issues[0]?.message ?? 'Enter a name.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('master_lookup_items')
        .insert(masterLookupFormPayload(parsed.data));
      if (error) throw error;
      setName('');
      toast.success(`${MASTER_LOOKUP_KIND_LABELS[kind]} item added.`);
      await reload();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to add item');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: MasterLookupItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditSortOrder(String(item.sort_order));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditSortOrder('0');
  }

  async function saveEdit(item: MasterLookupItem) {
    const parsed = masterLookupFormSchema.safeParse({
      kind,
      name: editName,
      sort_order: Number(editSortOrder) || 0,
      is_active: item.is_active
    });
    if (!parsed.success) {
      pageError(parsed.error.issues[0]?.message ?? 'Enter a name.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('master_lookup_items')
        .update(masterLookupFormPayload(parsed.data))
        .eq('id', item.id);
      if (error) throw error;
      cancelEdit();
      toast.success('Item updated.');
      await reload();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to update item');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: MasterLookupItem) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('master_lookup_items')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);
      if (error) throw error;
      await reload();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: MasterLookupItem) {
    if (
      !window.confirm(
        `Delete "${item.name}"? Existing records keep their saved value.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('master_lookup_items')
        .delete()
        .eq('id', item.id);
      if (error) throw error;
      toast.success('Item deleted.');
      await reload();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to delete item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-ds-gray-900">
          {MASTER_LOOKUP_KIND_LABELS[kind]}
        </div>
        <p className="text-xs text-ds-gray-500">
          Add, edit, or deactivate options used across leads, inventory, and
          project setup.
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${kind}-new-name`}>New item</Label>
          <Input
            id={`${kind}-new-name`}
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter name…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addItem();
              }
            }}
          />
        </div>
        <Button
          type="button"
          onClick={() => void addItem()}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Saving…' : 'Add'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ds-gray-200">
        <table className="w-full min-w-[32rem] caption-bottom text-sm">
          <thead>
            <tr className="border-b border-ds-gray-100 bg-ds-gray-50/80">
              <th className="px-4 py-2.5 text-left font-medium text-ds-gray-600">
                Name
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-ds-gray-600">
                Order
              </th>
              <th className="px-4 py-2.5 text-left font-medium text-ds-gray-600">
                Status
              </th>
              <th className="px-4 py-2.5 text-right font-medium text-ds-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <CrmTableBodySkeleton colSpan={4} />
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-ds-gray-500"
                >
                  No items yet. Add one above.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-ds-gray-100 last:border-0"
                >
                  <td className="px-4 py-2.5">
                    {editingId === item.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8"
                      />
                    ) : (
                      <span className="font-medium text-ds-gray-900">
                        {item.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {editingId === item.id ? (
                      <Input
                        type="number"
                        min={0}
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(e.target.value)}
                        className="h-8 w-20"
                      />
                    ) : (
                      <span className="tabular-nums text-ds-gray-600">
                        {item.sort_order}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusChip
                      tone={item.is_active ? 'success' : 'neutral'}
                      size="md"
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </StatusChip>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {editingId === item.id ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={saving}
                            onClick={() => void saveEdit(item)}
                            aria-label="Save"
                          >
                            <Check className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={saving}
                            onClick={cancelEdit}
                            aria-label="Cancel"
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={saving}
                            onClick={() => startEdit(item)}
                            aria-label="Edit"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={saving}
                            onClick={() => void toggleActive(item)}
                            aria-label={
                              item.is_active ? 'Deactivate' : 'Activate'
                            }
                          >
                            {item.is_active ? 'Off' : 'On'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8 text-ds-error-600"
                            disabled={saving}
                            onClick={() => void deleteItem(item)}
                            aria-label="Delete"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
