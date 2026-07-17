'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import {
  Building2,
  Grid3X3,
  Layers3,
  Map,
  Plus,
  Ruler,
  Trash2
} from 'lucide-react';
import {
  applyDefaultUnitCategoryToFloorProvisions,
  applyDefaultUnitTypeToFloorProvisions
} from './project-create-shared';
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
  structureAddLabel,
  structureDepthKind,
  type FloorProvisionDraft,
  type StructureNode,
  buildUnitConfigs,
  computeAreaPerUnitFromInventory,
  getStructureLeaves,
  newBuildingNode,
  newFloorNode,
  newWingNode,
  normalizeStructures,
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

function nextFloorNumber(floors: StructureNode[]): number {
  if (!floors.length) return 0;
  return (
    Math.max(
      ...floors.map((f) =>
        Math.max(0, Number(f.floorNumber) || Number(f.floorsPerStructure) || 0)
      )
    ) + 1
  );
}

const STRUCTURE_ROW_GRID =
  'grid min-w-[40rem] grid-cols-[1.25rem_1.25rem_minmax(12rem,1fr)_7rem_6.5rem_6.5rem_5.25rem] items-center gap-x-3';

function StructureKindIcon({ kind }: { kind: string }) {
  const Icon =
    kind === 'building' ? Building2 : kind === 'wing' ? Layers3 : Grid3X3;

  return <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />;
}

function StructureTreeGutter({
  depth,
  gutterIdx
}: {
  depth: number;
  gutterIdx: number;
}) {
  const showLine = depth > gutterIdx;

  return (
    <div className="relative self-stretch" aria-hidden>
      {showLine ? (
        <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-ds-primary-300/80" />
      ) : null}
    </div>
  );
}

function StructureRowField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="sr-only">{label}</div>
      {children}
    </div>
  );
}

export function StructureTreeFields({
  nodes,
  onNodesChange,
  defaultFloors,
  defaultUnitsPerFloor
}: StructureTreeFieldsProps) {
  const structureSummary = useMemo(() => {
    const summary = { buildings: 0, wings: 0, floors: 0, units: 0 };

    const visit = (items: StructureNode[]) => {
      for (const node of items || []) {
        const kind = node.kind;
        if (kind === 'building') summary.buildings += 1;
        if (kind === 'wing') summary.wings += 1;
        if (kind === 'floor') {
          summary.floors += 1;
          summary.units += Math.max(
            1,
            Number(node.unitsPerFloor) ||
              (node.children || []).filter((child) => child.kind === 'unit')
                .length ||
              defaultUnitsPerFloor
          );
        }
        visit((node.children || []).filter((child) => child.kind !== 'unit'));
      }
    };

    visit(nodes);
    return summary;
  }, [defaultUnitsPerFloor, nodes]);

  const renderNodes = (list: StructureNode[], pathPrefix: number[], depth: number) => (
    <div className="flex flex-col gap-2">
      {(list || [])
        .filter((node) => node.kind !== 'unit')
        .map((node, idx) => {
        const path = pathPrefix.concat(idx);
        const kind = node.kind || structureDepthKind(depth);
        const isFloor = kind === 'floor';
        const canAddChild = depth < 2;
        const childDepth = depth + 1;
        const visibleChildren = (node.children || []).filter(
          (c) => c.kind !== 'unit'
        );
        const floorUnitCount = Math.max(
          1,
          Number(node.unitsPerFloor) ||
            (node.children || []).filter((c) => c.kind === 'unit').length ||
            defaultUnitsPerFloor
        );
        return (
          <div key={node.id || idx} className="flex flex-col gap-2">
            <div
              className={cn(
                STRUCTURE_ROW_GRID,
                'rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-ds-primary-200 hover:bg-ds-primary-50/30'
              )}
            >
              {[0, 1].map((gutterIdx) => (
                <StructureTreeGutter
                  key={gutterIdx}
                  depth={depth}
                  gutterIdx={gutterIdx}
                />
              ))}
              <StructureRowField label="Name">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-ds-primary-600">
                    <StructureKindIcon kind={kind} />
                  </div>
                  <Input
                    value={node.name}
                    onChange={(e) => {
                      onNodesChange(
                        updateAtPath(nodes, path, (arr, i) => {
                          arr[i] = { ...arr[i], name: e.target.value };
                        })
                      );
                    }}
                    className="h-9 border-transparent bg-muted pl-8 text-xs font-medium shadow-none focus-visible:border-primary focus-visible:bg-background"
                    placeholder={
                      kind === 'building'
                        ? 'e.g. Building 1'
                        : kind === 'wing'
                          ? 'e.g. Wing A'
                          : 'e.g. Floor 3'
                    }
                  />
                </div>
              </StructureRowField>
              <StructureRowField label="Level">
                  <div className="flex h-9 items-center rounded-md border border-ds-primary-100 bg-ds-primary-50 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-ds-primary-700">
                    {kind}
                  </div>
              </StructureRowField>
              <StructureRowField label="Floor #">
                  {isFloor ? (
                    <Input
                      type="number"
                      min={0}
                      value={
                        node.floorNumber != null
                          ? node.floorNumber
                          : node.floorsPerStructure ?? 0
                      }
                      onChange={(e) => {
                        const floorNumber = Math.max(
                          0,
                          parseInt(e.target.value, 10) || 0
                        );
                        onNodesChange(
                          updateAtPath(nodes, path, (arr, i) => {
                            arr[i] = {
                              ...arr[i],
                              kind: 'floor',
                              floorNumber,
                              floorsPerStructure: floorNumber
                            };
                          })
                        );
                      }}
                      className="h-9 bg-muted text-center text-xs font-semibold"
                    />
                  ) : (
                    <div
                      className="flex h-9 items-center justify-center text-xs text-muted-foreground"
                      aria-hidden
                    >
                      —
                    </div>
                  )}
              </StructureRowField>
              <StructureRowField label="Units">
                  {isFloor ? (
                    <Input
                      type="number"
                      min={1}
                      value={floorUnitCount}
                      onChange={(e) => {
                        const unitsPerFloor = Math.max(
                          1,
                          parseInt(e.target.value, 10) || 1
                        );
                        onNodesChange(
                          updateAtPath(nodes, path, (arr, i) => {
                            arr[i] = {
                              ...arr[i],
                              kind: 'floor',
                              unitsPerFloor,
                              children: (arr[i].children || []).filter(
                                (c) => c.kind !== 'unit'
                              )
                            };
                          })
                        );
                      }}
                      className="h-9 bg-muted text-center text-xs font-semibold"
                    />
                  ) : (
                    <div
                      className="flex h-9 items-center justify-center text-xs text-muted-foreground"
                      aria-hidden
                    >
                      —
                    </div>
                  )}
              </StructureRowField>
              <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-full gap-1.5 text-xs text-muted-foreground hover:bg-ds-error-50 hover:text-ds-error-600"
                  onClick={() => onNodesChange(removeAtPath(nodes, path))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove
                </Button>
            </div>
            {visibleChildren.length
              ? renderNodes(visibleChildren, path, childDepth)
              : null}
            {canAddChild ? (
              <div className={cn(STRUCTURE_ROW_GRID, 'py-0.5')}>
                <div className="col-span-2" aria-hidden />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="col-span-2 h-8 w-fit gap-1.5 border-dashed border-ds-primary-300 bg-ds-primary-50/70 px-3 text-[11px] font-semibold text-ds-primary-700 hover:bg-ds-primary-100"
                  onClick={() => {
                    onNodesChange(
                      updateAtPath(nodes, path, (arr, i) => {
                        const parent = arr[i];
                        const siblings = (parent.children || []).filter(
                          (c) => c.kind !== 'unit'
                        );
                        let child: StructureNode;
                        if (childDepth === 1) {
                          child = newWingNode(siblings.length + 1);
                          child.unitsPerFloor = defaultUnitsPerFloor;
                          child.floorsPerStructure = defaultFloors;
                        } else {
                          const floorNumber = nextFloorNumber(siblings);
                          child = newFloorNode(floorNumber, defaultUnitsPerFloor);
                        }
                        arr[i] = {
                          ...parent,
                          children: [...siblings, child]
                        };
                      })
                    );
                  }}
                >
                  <Plus className="size-3.5" aria-hidden />
                  {structureAddLabel(childDepth)}
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="relative overflow-hidden border-b border-ds-primary-200 bg-ds-primary-50 px-4 py-4 sm:px-5">
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--ds-primary-100)_1px,transparent_1px),linear-gradient(to_bottom,var(--ds-primary-100)_1px,transparent_1px)] bg-size-[20px_20px] opacity-50"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-ds-primary-200 bg-card text-ds-primary-600 shadow-sm">
              <Map className="size-5" strokeWidth={1.8} aria-hidden />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ds-primary-700">
                Project blueprint
              </div>
              <h3 className="mt-0.5 text-sm font-semibold text-foreground">
                Map your project structure
              </h3>
              <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                Lay out buildings, wings and floors here. Unit types, areas,
                rates and parking are detailed in the next step.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            {[
              ['Buildings', structureSummary.buildings],
              ['Wings', structureSummary.wings],
              ['Floors', structureSummary.floors],
              ['Units', structureSummary.units]
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="min-w-[68px] rounded-lg border border-ds-primary-200 bg-card/90 px-2.5 py-1.5 text-center"
              >
                <div className="text-sm font-bold tabular-nums text-ds-primary-700">
                  {value}
                </div>
                <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Ruler className="size-3.5 text-ds-primary-600" aria-hidden />
          <span>Hierarchy: Building → Wing → Floor</span>
          <span className="hidden h-px flex-1 bg-border sm:block" />
          <span className="hidden text-[10px] sm:inline">Blueprint v1.0</span>
        </div>
      <div className="overflow-x-auto rounded-lg border border-ds-primary-100 bg-muted/30 p-2.5 sm:p-3">
        <div
          className={cn(
            STRUCTURE_ROW_GRID,
            'mb-2 border-b border-ds-primary-100 px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground'
          )}
        >
          <div className="col-span-2" aria-hidden />
          <div>Name</div>
          <div>Level</div>
          <div>Floor #</div>
          <div>Units</div>
          <div aria-hidden />
        </div>
        {renderNodes(nodes, [], 0)}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 h-9 w-fit gap-1.5 border-dashed border-ds-primary-300 bg-ds-primary-50 text-[11px] font-semibold text-ds-primary-700 hover:bg-ds-primary-100"
        onClick={() =>
          onNodesChange([
            ...(nodes || []),
            newBuildingNode((nodes || []).length + 1)
          ])
        }
      >
        <Plus className="size-3.5" aria-hidden />
        {structureAddLabel(0)}
      </Button>
      </div>
    </section>
  );
}

type FloorConfigureStepProps = {
  structures: StructureNode[];
  floorProvisions: FloorProvisionDraft[];
  onFloorProvisionsChange: (next: FloorProvisionDraft[]) => void;
  unitTypes: string[];
  unitCategories: string[];
  baseRate: number;
  onAutoFill: () => void;
};

export function FloorConfigureStep({
  structures,
  floorProvisions,
  onFloorProvisionsChange,
  unitTypes,
  unitCategories,
  baseRate,
  onAutoFill
}: FloorConfigureStepProps) {
  const defaultUnitType = unitTypes[0] ?? '';
  const defaultUnitCategory = unitCategories[0] ?? '';
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

  useEffect(() => {
    if (!defaultUnitCategory || floorProvisions.length === 0) return;
    const hasEmpty = floorProvisions.some((row) =>
      (row.unitConfigs || []).some((u) => !(u.category || '').trim())
    );
    if (!hasEmpty) return;
    onFloorProvisionsChange(
      applyDefaultUnitCategoryToFloorProvisions(
        floorProvisions,
        defaultUnitCategory
      )
    );
    // Only re-run when the default category or row count changes (auto-fill / step entry).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- floorProvisions read at fill time
  }, [defaultUnitCategory, floorProvisions.length]);

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
      <div className="rounded-lg bg-ds-primary-50/90 px-3 py-2 text-xs text-ds-primary-800">
        Floor rows come from your <strong>Building → Wing → Floor</strong>{' '}
        inventory. Click <strong>Auto-fill floors</strong> to sync unit rows from
        your structure before editing types, areas and rates.
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-3 py-2.5">
          <div>
            <div className="text-[11px] font-semibold text-foreground">
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
            className="h-8 border-ds-primary-200 bg-ds-primary-50 text-[11px] text-ds-primary-700"
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
                className="flex flex-col gap-2 rounded-lg border border-border bg-muted p-2.5"
              >
                <div className="border-b border-border pb-1.5 text-[11px] font-bold text-foreground">
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
                      defaultUnitType,
                      defaultUnitCategory
                    );
                    const floorArea = unitConfigs.reduce(
                      (s, u) => s + Math.max(1, Number(u.area) || 1),
                      0
                    );
                    return (
                      <div
                        key={`${cfg.structureLeafId}-${cfg.floor}-${idx}`}
                        className="flex flex-col gap-2 rounded-md border border-border bg-card p-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[11px] font-bold text-foreground">
                            Floor{' '}
                            {cfg.floor === 0
                              ? 'Ground (0)'
                              : cfg.floor}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 border-ds-error-200 bg-ds-error-50 text-[10px] text-ds-error-600"
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
                                className="h-full w-7 border-r border-input bg-muted text-sm font-bold text-ds-gray-600 hover:bg-ds-gray-100"
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
                                      defaultUnitType,
                                      defaultUnitCategory
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
                                      defaultUnitType,
                                      defaultUnitCategory
                                    )
                                  });
                                }}
                              />
                              <button
                                type="button"
                                className="h-full w-7 border-l border-input bg-muted text-sm font-bold text-ds-gray-600 hover:bg-ds-gray-100"
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
                                      defaultUnitType,
                                      defaultUnitCategory
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
                              unitCategories={unitCategories}
                              defaultUnitType={defaultUnitType}
                              defaultUnitCategory={defaultUnitCategory}
                              leaves={leaves}
                              baseRate={baseRate}
                              onPatchProvision={patchProvision}
                            />
                          ))}
                          <div className="flex flex-wrap gap-3 border-t border-ds-gray-100 pt-2">
                            <div className="min-w-[140px]">
                              <Label className="text-[10px] text-muted-foreground">
                                Floor area (sq.ft)
                              </Label>
                              <Input
                                readOnly
                                value={floorArea}
                                className="h-8 bg-ds-success-50 text-[11px] font-bold text-ds-success-800"
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
                                      defaultUnitType,
                                      defaultUnitCategory
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
  unitCategories: string[];
  defaultUnitType: string;
  defaultUnitCategory: string;
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
  unitCategories,
  defaultUnitType,
  defaultUnitCategory,
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
        defaultUnitType,
        defaultUnitCategory
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
    <div className="flex flex-col gap-2 rounded-md border border-ds-gray-100 bg-muted/80 p-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
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
            Unit {uCfg.unitNo} category
          </Label>
          <SearchableSelect
            value={uCfg.category || ''}
            onValueChange={(v) => {
              syncUnitConfigs((list) =>
                list.map((x) =>
                  x.unitNo === uCfg.unitNo ? { ...x, category: v } : x
                )
              );
            }}
            options={unitCategories}
            placeholder="Select category…"
            searchPlaceholder="Search category…"
            className="mt-1 h-8 w-full px-2 text-[11px] shadow-none"
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
          <div className="text-[10px] font-semibold text-ds-gray-700">
            List price (preview)
          </div>
          <div className="text-[11px] font-bold text-ds-primary-600">{listPreview}</div>
          <div className="text-[9px] text-muted-foreground">
            {uCfg.type || 'Auto'}
            {uCfg.category ? ` · ${uCfg.category}` : ''} · carpet/BUA override
            sale area for pricing
          </div>
        </div>
      </div>

      <div className="grid gap-2 border-t border-border pt-2 sm:grid-cols-3 lg:grid-cols-9">
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