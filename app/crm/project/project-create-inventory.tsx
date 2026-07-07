'use client';

import { useEffect, useMemo } from 'react';
import { applyDefaultUnitTypeToFloorProvisions } from './project-create-shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatUnitAgreementValueCompact } from '../inr-format';
import {
  STRUCTURE_KINDS,
  type FloorProvisionDraft,
  type StructureNode,
  buildUnitConfigs,
  computeAreaPerUnitFromInventory,
  getStructureLeaves,
  newStructureId,
  normalizeStructures,
  totalStructureLeafArea,
  type UnitConfigDraft
} from './project-structure-utils';

type StructureTreeFieldsProps = {
  nodes: StructureNode[];
  onNodesChange: (next: StructureNode[]) => void;
  defaultFloors: number;
  defaultUnitsPerFloor: number;
};

function updateAtPath(
  nodes: StructureNode[],
  path: number[],
  fn: (arr: StructureNode[], idx: number) => void
): StructureNode[] {
  const next = JSON.parse(JSON.stringify(nodes || [])) as StructureNode[];
  let parentArr = next;
  for (let d = 0; d < path.length - 1; d++) {
    parentArr = parentArr[path[d]].children;
  }
  const idx = path[path.length - 1];
  fn(parentArr, idx);
  return next;
}

function removeAtPath(nodes: StructureNode[], path: number[]): StructureNode[] {
  const next = JSON.parse(JSON.stringify(nodes || [])) as StructureNode[];
  let parentArr = next;
  for (let d = 0; d < path.length - 1; d++) {
    parentArr = parentArr[path[d]].children;
  }
  parentArr.splice(path[path.length - 1], 1);
  return next;
}

export function StructureTreeFields({
  nodes,
  onNodesChange,
  defaultFloors,
  defaultUnitsPerFloor
}: StructureTreeFieldsProps) {
  const renderNodes = (list: StructureNode[], pathPrefix: number[], depth: number) => (
    <div className="flex flex-col gap-2.5">
      {(list || []).map((node, idx) => {
        const path = pathPrefix.concat(idx);
        const hasKids = node.children && node.children.length > 0;
        return (
          <div
            key={node.id || idx}
            className={cn(
              depth > 0 && 'ml-1 border-l-2 border-slate-200 pl-3'
            )}
          >
            <div
              className={cn(
                'flex flex-wrap items-end gap-2',
                hasKids ? 'mb-2' : ''
              )}
            >
              <div className="w-[120px]">
                <div className="text-[10px] text-muted-foreground">Name</div>
                <Input
                  value={node.name}
                  onChange={(e) => {
                    onNodesChange(
                      updateAtPath(nodes, path, (arr, i) => {
                        arr[i] = { ...arr[i], name: e.target.value };
                      })
                    );
                  }}
                  className="h-8 text-[11px]"
                  placeholder="e.g. Tower A"
                />
              </div>
              <div className="w-[100px]">
                <div className="text-[10px] text-muted-foreground">Kind</div>
                <Select
                  value={node.kind || 'wing'}
                  onValueChange={(v) => {
                    onNodesChange(
                      updateAtPath(nodes, path, (arr, i) => {
                        arr[i] = { ...arr[i], kind: v };
                      })
                    );
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 w-full px-2 text-[11px] shadow-none"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRUCTURE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!hasKids ? (
                <>
                  <div className="w-[110px]">
                    <div className="text-[10px] text-muted-foreground">
                      Area (sq.ft)
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={node.area != null ? node.area : 0}
                      onChange={(e) => {
                        onNodesChange(
                          updateAtPath(nodes, path, (arr, i) => {
                            arr[i] = {
                              ...arr[i],
                              area: Math.max(
                                0,
                                parseInt(e.target.value, 10) || 0
                              )
                            };
                          })
                        );
                      }}
                      className="h-8 text-[11px]"
                    />
                  </div>
                  <div className="w-[90px]">
                    <div className="text-[10px] text-muted-foreground">
                      Floors
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={
                        node.floorsPerStructure != null
                          ? node.floorsPerStructure
                          : defaultFloors
                      }
                      onChange={(e) => {
                        onNodesChange(
                          updateAtPath(nodes, path, (arr, i) => {
                            arr[i] = {
                              ...arr[i],
                              floorsPerStructure: Math.max(
                                1,
                                parseInt(e.target.value, 10) || 1
                              )
                            };
                          })
                        );
                      }}
                      className="h-8 text-[11px]"
                    />
                  </div>
                  <div className="w-[78px]">
                    <div className="text-[10px] text-muted-foreground">
                      Parking #
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={
                        node.parkingCount != null ? node.parkingCount : 0
                      }
                      onChange={(e) => {
                        onNodesChange(
                          updateAtPath(nodes, path, (arr, i) => {
                            arr[i] = {
                              ...arr[i],
                              parkingCount: Math.max(
                                0,
                                parseInt(e.target.value, 10) || 0
                              )
                            };
                          })
                        );
                      }}
                      className="h-8 text-[11px]"
                    />
                  </div>
                  <div className="w-[100px]">
                    <div className="text-[10px] text-muted-foreground">
                      ₹ / slot
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={
                        node.parkingRate != null ? node.parkingRate : 0
                      }
                      onChange={(e) => {
                        onNodesChange(
                          updateAtPath(nodes, path, (arr, i) => {
                            arr[i] = {
                              ...arr[i],
                              parkingRate: Math.max(
                                0,
                                parseInt(e.target.value, 10) || 0
                              )
                            };
                          })
                        );
                      }}
                      className="h-8 text-[11px]"
                    />
                  </div>
                </>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-red-200 bg-red-50 text-[10px] text-red-600 hover:bg-red-100"
                onClick={() => onNodesChange(removeAtPath(nodes, path))}
              >
                Remove
              </Button>
            </div>
            {hasKids ? renderNodes(node.children, path, depth + 1) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {renderNodes(nodes, [], 0)}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-fit border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
        onClick={() =>
          onNodesChange([
            ...(nodes || []),
            {
              id: newStructureId(),
              name: `Wing ${(nodes || []).length + 1}`,
              kind: 'wing',
              area: 0,
              floorsPerStructure: defaultFloors,
              unitsPerFloor: defaultUnitsPerFloor,
              parkingCount: 0,
              parkingRate: 0,
              children: []
            }
          ])
        }
      >
        + Add structure (root)
      </Button>
    </div>
  );
}

type FloorConfigureStepProps = {
  structures: StructureNode[];
  floorProvisions: FloorProvisionDraft[];
  onFloorProvisionsChange: (next: FloorProvisionDraft[]) => void;
  unitTypes: string[];
  baseRate: number;
  onAutoFill: () => void;
};

export function FloorConfigureStep({
  structures,
  floorProvisions,
  onFloorProvisionsChange,
  unitTypes,
  baseRate,
  onAutoFill
}: FloorConfigureStepProps) {
  const defaultUnitType = unitTypes[0] ?? '';
  const leaves = useMemo(
    () => getStructureLeaves(normalizeStructures(structures)),
    [structures]
  );

  useEffect(() => {
    if (!defaultUnitType || floorProvisions.length === 0) return;
    const hasEmpty = floorProvisions.some((row) =>
      (row.unitConfigs || []).some((u) => !(u.type || '').trim())
    );
    if (!hasEmpty) return;
    onFloorProvisionsChange(
      applyDefaultUnitTypeToFloorProvisions(floorProvisions, defaultUnitType)
    );
    // Only re-run when the default type or row count changes (auto-fill / step entry).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- floorProvisions read at fill time
  }, [defaultUnitType, floorProvisions.length]);

  const grouped = useMemo(() => {
    const acc: Record<string, FloorProvisionDraft[]> = {};
    for (const cfg of floorProvisions) {
      const key = cfg.structurePath || cfg.structureName || 'All structures';
      if (!acc[key]) acc[key] = [];
      acc[key].push(cfg);
    }
    return Object.entries(acc).sort(([a], [b]) => a.localeCompare(b));
  }, [floorProvisions]);

  function patchProvision(
    actualIdx: number,
    patch: Partial<FloorProvisionDraft>
  ) {
    const next = [...floorProvisions];
    next[actualIdx] = { ...next[actualIdx], ...patch };
    onFloorProvisionsChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-blue-50/90 px-3 py-2 text-xs text-blue-800">
        Use the name, kind, area, and floors from Inventory as the basis for
        units on each floor. Click <strong>Auto-fill floors</strong> if you
        have not generated rows yet.
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
          <div>
            <div className="text-[11px] font-semibold text-slate-900">
              Floor-wise configure
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              Set units per floor: carpet/BUA/RERA, outdoor areas, rate, floor-rise
              and PLC, and parking per unit. Floor area is the sum of legacy unit
              areas.
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-blue-200 bg-blue-50 text-[11px] text-blue-700"
            onClick={onAutoFill}
          >
            Auto-fill floors
          </Button>
        </div>

        {floorProvisions.length === 0 ? (
          <div className="p-3 text-[11px] text-muted-foreground">
            No floor configs yet. Click <strong>Auto-fill floors</strong> to
            create rows from your structure tree.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 p-3">
            {grouped.map(([structureName, structureRows]) => (
              <div
                key={structureName}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"
              >
                <div className="border-b border-slate-200 pb-1.5 text-[11px] font-bold text-slate-900">
                  {structureName}
                </div>
                {structureRows
                  .slice()
                  .sort(
                    (a, b) => (Number(b.floor) || 0) - (Number(a.floor) || 0)
                  )
                  .map((cfg, idx) => {
                    const actualIdx = floorProvisions.indexOf(cfg);
                    const unitCount = Math.max(
                      1,
                      Number(cfg.unitsPerFloor) || 1
                    );
                    const unitConfigs = buildUnitConfigs(
                      cfg.structureLeafId || '',
                      unitCount,
                      cfg.unitConfigs,
                      cfg.rate ?? baseRate,
                      leaves,
                      defaultUnitType
                    );
                    const floorArea = unitConfigs.reduce(
                      (s, u) => s + Math.max(1, Number(u.area) || 1),
                      0
                    );
                    return (
                      <div
                        key={`${cfg.structureLeafId}-${cfg.floor}-${idx}`}
                        className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] font-bold text-slate-900">
                            Floor{' '}
                            {cfg.floor === 0
                              ? 'Ground (0)'
                              : cfg.floor}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 border-red-200 bg-red-50 text-[10px] text-red-600"
                            onClick={() => {
                              const next = floorProvisions.filter(
                                (_, i) => i !== actualIdx
                              );
                              onFloorProvisionsChange(next);
                            }}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-end gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">
                              Units
                            </Label>
                            <div className="flex h-8 items-center overflow-hidden rounded-md border border-input">
                              <button
                                type="button"
                                className="h-full w-7 border-r border-input bg-slate-50 text-sm font-bold text-slate-600 hover:bg-slate-100"
                                onClick={() => {
                                  const current = Math.max(
                                    1,
                                    Number(
                                      floorProvisions[actualIdx].unitsPerFloor
                                    ) || 1
                                  );
                                  const units = Math.max(1, current - 1);
                                  const row = floorProvisions[actualIdx];
                                  patchProvision(actualIdx, {
                                    unitsPerFloor: units,
                                    area: computeAreaPerUnitFromInventory(
                                      row.structureLeafId || '',
                                      units,
                                      leaves
                                    ),
                                    unitConfigs: buildUnitConfigs(
                                      row.structureLeafId || '',
                                      units,
                                      row.unitConfigs,
                                      row.rate ?? baseRate,
                                      leaves,
                                      defaultUnitType
                                    )
                                  });
                                }}
                              >
                                −
                              </button>
                              <Input
                                type="number"
                                min={1}
                                className="h-full w-14 border-0 bg-transparent px-0 text-center text-[11px] shadow-none focus-visible:ring-0"
                                value={unitCount}
                                onChange={(e) => {
                                  const v = Math.max(
                                    1,
                                    Number(e.target.value) || 1
                                  );
                                  const row = floorProvisions[actualIdx];
                                  patchProvision(actualIdx, {
                                    unitsPerFloor: v,
                                    area: computeAreaPerUnitFromInventory(
                                      row.structureLeafId || '',
                                      v,
                                      leaves
                                    ),
                                    unitConfigs: buildUnitConfigs(
                                      row.structureLeafId || '',
                                      v,
                                      row.unitConfigs,
                                      row.rate ?? baseRate,
                                      leaves,
                                      defaultUnitType
                                    )
                                  });
                                }}
                              />
                              <button
                                type="button"
                                className="h-full w-7 border-l border-input bg-slate-50 text-sm font-bold text-slate-600 hover:bg-slate-100"
                                onClick={() => {
                                  const current = Math.max(
                                    1,
                                    Number(
                                      floorProvisions[actualIdx].unitsPerFloor
                                    ) || 1
                                  );
                                  const units = current + 1;
                                  const row = floorProvisions[actualIdx];
                                  patchProvision(actualIdx, {
                                    unitsPerFloor: units,
                                    area: computeAreaPerUnitFromInventory(
                                      row.structureLeafId || '',
                                      units,
                                      leaves
                                    ),
                                    unitConfigs: buildUnitConfigs(
                                      row.structureLeafId || '',
                                      units,
                                      row.unitConfigs,
                                      row.rate ?? baseRate,
                                      leaves,
                                      defaultUnitType
                                    )
                                  });
                                }}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          {unitConfigs.map((uCfg) => (
                            <UnitConfigBlock
                              key={uCfg.unitNo}
                              uCfg={uCfg}
                              cfg={cfg}
                              actualIdx={actualIdx}
                              floorProvisions={floorProvisions}
                              unitTypes={unitTypes}
                              defaultUnitType={defaultUnitType}
                              leaves={leaves}
                              baseRate={baseRate}
                              onPatchProvision={patchProvision}
                            />
                          ))}
                          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-2">
                            <div className="min-w-[140px]">
                              <Label className="text-[10px] text-muted-foreground">
                                Floor area (sq.ft)
                              </Label>
                              <Input
                                readOnly
                                value={floorArea}
                                className="h-8 bg-emerald-50 text-[11px] font-bold text-emerald-800"
                              />
                            </div>
                            <div className="min-w-[140px]">
                              <Label className="text-[10px] text-muted-foreground">
                                Default rate (₹/sq.ft)
                              </Label>
                              <Input
                                type="number"
                                min={1}
                                value={cfg.rate ?? 0}
                                className="h-8 text-[11px]"
                                onChange={(e) => {
                                  const v = Math.max(
                                    1,
                                    Number(e.target.value) || 1
                                  );
                                  const row = floorProvisions[actualIdx];
                                  patchProvision(actualIdx, {
                                    rate: v,
                                    unitConfigs: buildUnitConfigs(
                                      row.structureLeafId || '',
                                      row.unitsPerFloor,
                                      row.unitConfigs,
                                      v,
                                      leaves,
                                      defaultUnitType
                                    )
                                  });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type UnitConfigBlockProps = {
  uCfg: UnitConfigDraft;
  cfg: FloorProvisionDraft;
  actualIdx: number;
  floorProvisions: FloorProvisionDraft[];
  unitTypes: string[];
  defaultUnitType: string;
  leaves: ReturnType<typeof getStructureLeaves>;
  baseRate: number;
  onPatchProvision: (
    idx: number,
    patch: Partial<FloorProvisionDraft>
  ) => void;
};

function UnitConfigBlock({
  uCfg,
  cfg,
  actualIdx,
  floorProvisions,
  unitTypes,
  defaultUnitType,
  leaves,
  baseRate,
  onPatchProvision
}: UnitConfigBlockProps) {
  function syncUnitConfigs(
    mut: (list: UnitConfigDraft[]) => UnitConfigDraft[]
  ) {
    const row = floorProvisions[actualIdx];
    const list = mut(
      buildUnitConfigs(
        row.structureLeafId || '',
        row.unitsPerFloor,
        row.unitConfigs,
        row.rate ?? baseRate,
        leaves,
        defaultUnitType
      )
    );
    onPatchProvision(actualIdx, { unitConfigs: list });
  }

  const effRate = uCfg.rate || cfg.rate || baseRate;
  const listPreview = formatUnitAgreementValueCompact({
    area: uCfg.area,
    carpet_area: uCfg.carpet_area ?? null,
    bua_area: uCfg.bua_area ?? null,
    rate: effRate,
    floor_rise_charge: uCfg.floor_rise_charge ?? null,
    plc_charge: uCfg.plc_charge ?? null
  });

  function patchField<K extends keyof UnitConfigDraft>(
    key: K,
    value: UnitConfigDraft[K]
  ) {
    syncUnitConfigs((list) =>
      list.map((x) => (x.unitNo === uCfg.unitNo ? { ...x, [key]: value } : x))
    );
  }

  function optionalSqft(
    key:
      | 'carpet_area'
      | 'bua_area'
      | 'rera_area'
      | 'terrace_sqft'
      | 'deck_sqft'
      | 'loading_sqft',
    label: string
  ) {
    const raw = uCfg[key];
    return (
      <div key={key}>
        <Label className="text-[10px] text-muted-foreground">{label}</Label>
        <Input
          type="number"
          min={0}
          placeholder="—"
          value={raw != null && raw > 0 ? raw : ''}
          className="h-8 text-[11px]"
          onChange={(e) => {
            const t = e.target.value.trim();
            if (t === '') {
              patchField(key, undefined);
              return;
            }
            const v = Math.max(0, Number(t) || 0);
            patchField(key, v > 0 ? v : undefined);
          }}
        />
      </div>
    );
  }

  function optionalInr(
    key: 'floor_rise_charge' | 'plc_charge',
    label: string
  ) {
    const raw = uCfg[key];
    return (
      <div key={key}>
        <Label className="text-[10px] text-muted-foreground">{label}</Label>
        <Input
          type="number"
          min={0}
          placeholder="0"
          value={raw != null ? raw : ''}
          className="h-8 text-[11px]"
          onChange={(e) => {
            const t = e.target.value.trim();
            if (t === '') {
              patchField(key, undefined);
              return;
            }
            patchField(key, Math.max(0, Math.round(Number(t) || 0)));
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50/80 p-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <Label className="text-[10px] text-muted-foreground">
            Unit {uCfg.unitNo} name
          </Label>
          <Input
            value={uCfg.name || ''}
            placeholder={`Auto (e.g. ${cfg.floor || 1}0${uCfg.unitNo})`}
            className="h-8 text-[11px]"
            onChange={(e) => {
              const v = e.target.value;
              syncUnitConfigs((list) =>
                list.map((x) =>
                  x.unitNo === uCfg.unitNo ? { ...x, name: v } : x
                )
              );
            }}
          />
        </div>
        <div>
          <FieldLabel className="text-[10px] text-muted-foreground" required>
            Unit {uCfg.unitNo} type
          </FieldLabel>
          <SearchableSelect
            value={uCfg.type || ''}
            onValueChange={(v) => {
              syncUnitConfigs((list) =>
                list.map((x) =>
                  x.unitNo === uCfg.unitNo ? { ...x, type: v } : x
                )
              );
            }}
            options={unitTypes}
            placeholder="Select type…"
            searchPlaceholder="Search type…"
            className={cn(
              'mt-1 h-8 w-full px-2 text-[11px] shadow-none',
              !uCfg.type?.trim() && 'border-ds-error-200'
            )}
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">
            Sale area (sq.ft)
          </Label>
          <Input
            type="number"
            min={1}
            value={uCfg.area}
            className="h-8 text-[11px]"
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              syncUnitConfigs((list) =>
                list.map((x) =>
                  x.unitNo === uCfg.unitNo ? { ...x, area: v } : x
                )
              );
            }}
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">
            Rate (₹/sq.ft)
          </Label>
          <Input
            type="number"
            min={1}
            value={effRate}
            className="h-8 text-[11px]"
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              syncUnitConfigs((list) =>
                list.map((x) =>
                  x.unitNo === uCfg.unitNo ? { ...x, rate: v } : x
                )
              );
            }}
          />
        </div>
        <div className="flex flex-col justify-end lg:col-span-2">
          <div className="text-[10px] font-semibold text-slate-700">
            List price (preview)
          </div>
          <div className="text-[11px] font-bold text-blue-600">{listPreview}</div>
          <div className="text-[9px] text-muted-foreground">
            {uCfg.type || 'Auto'} · carpet/BUA override sale area for pricing
          </div>
        </div>
      </div>

      <div className="grid gap-2 border-t border-slate-200/80 pt-2 sm:grid-cols-3 lg:grid-cols-9">
        {optionalSqft('carpet_area', 'Carpet')}
        {optionalSqft('bua_area', 'BUA')}
        {optionalSqft('rera_area', 'RERA')}
        {optionalSqft('terrace_sqft', 'Terrace')}
        {optionalSqft('deck_sqft', 'Deck')}
        {optionalSqft('loading_sqft', 'Loading')}
        {optionalInr('floor_rise_charge', 'Floor-rise ₹')}
        {optionalInr('plc_charge', 'PLC ₹')}
        <div>
          <Label className="text-[10px] text-muted-foreground">Pk slots</Label>
          <Input
            type="number"
            min={0}
            placeholder="0"
            value={
              uCfg.parking_slots_included != null
                ? uCfg.parking_slots_included
                : ''
            }
            className="h-8 text-[11px]"
            onChange={(e) => {
              const t = e.target.value.trim();
              if (t === '') {
                patchField('parking_slots_included', undefined);
                return;
              }
              patchField(
                'parking_slots_included',
                Math.max(0, Math.floor(Number(t) || 0))
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function InventoryConfigSummary(props: {
  draftName: string;
  projectType: string;
  structures: StructureNode[];
  floorsPerWing: number;
  unitsPerFloor: number;
  onFloorsPerWingChange: (n: number) => void;
  onUnitsPerFloorChange: (n: number) => void;
}) {
  const totalArea = totalStructureLeafArea(props.structures);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Name', props.draftName || '—'],
          ['Kind', props.projectType || '—'],
          ['Area', `${totalArea} sq.ft (all structures)`],
          ['Default floors', String(props.floorsPerWing || 0)]
        ].map(([k, v]) => (
          <div
            key={k}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2"
          >
            <div className="text-[9px] text-slate-400">{k}</div>
            <div className="text-xs font-bold text-slate-900">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <Label>Default floors (new leaves)</Label>
          <Input
            type="number"
            min={1}
            className="mt-1 h-9 w-[140px]"
            value={props.floorsPerWing}
            onChange={(e) =>
              props.onFloorsPerWingChange(
                Math.max(1, Number(e.target.value) || 1)
              )
            }
          />
        </div>
        <div>
          <Label>Default units (new leaves)</Label>
          <Input
            type="number"
            min={1}
            className="mt-1 h-9 w-[140px]"
            value={props.unitsPerFloor}
            onChange={(e) =>
              props.onUnitsPerFloorChange(
                Math.max(1, Number(e.target.value) || 1)
              )
            }
          />
        </div>
      </div>
    </>
  );
}
