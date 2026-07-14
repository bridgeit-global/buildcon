'use client';

import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pageError, toast } from '@/lib/toast';
import type { CreateProjectDraft } from './project-create-shared';
import {
  downloadProjectExcelTemplate,
  parseProjectExcelFile
} from './project-excel';

type Props = {
  onImported: (patch: Partial<CreateProjectDraft>, unitCount: number) => void;
};

export function ProjectExcelImportCard({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const result = await parseProjectExcelFile(file);
      onImported(result.draftPatch, result.unitCount);
      const warnSuffix =
        result.warnings.length > 0
          ? ` (${result.warnings.length} warning${
              result.warnings.length === 1 ? '' : 's'
            })`
          : '';
      toast.success(
        `Imported ${result.unitCount} unit${
          result.unitCount === 1 ? '' : 's'
        } from Excel${warnSuffix}.`
      );
      if (result.warnings.length) {
        toast.warning(result.warnings.slice(0, 3).join(' '));
      }
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to import Excel file.');
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileSpreadsheet className="size-4 shrink-0 text-primary" aria-hidden />
            Excel import
          </div>
          <p className="text-xs text-muted-foreground">
            Download the template, fill project and unit rows, then upload to
            prefill inventory and floor configuration.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => downloadProjectExcelTemplate()}
            disabled={importing}
          >
            <Download className="size-4" aria-hidden />
            Download template
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-11"
            onClick={() => inputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {importing ? 'Importing…' : 'Upload Excel'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="sr-only"
            aria-label="Upload project Excel file"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
      </div>
    </div>
  );
}
