'use client';

import { useRef, useState } from 'react';
import { FileUp, X } from 'lucide-react';
import { FieldLabel } from '@/components/ui/field-label';
import { FormFieldError } from '@/components/ui/form-field-error';
import { Button } from '@/components/ui/button';
import { formControlFieldGapClass, formControlInvalidClass } from '@/components/ui/form-control';
import { cn } from '@/lib/utils';

export type FileUploadFieldProps = {
  label?: string;
  required?: boolean;
  accept?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  onChange?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

export function FileUploadField({
  label = 'File',
  required,
  accept,
  hint,
  error,
  disabled,
  id,
  onChange,
  inputRef
}: FileUploadFieldProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  function syncFileName() {
    const file = ref.current?.files?.[0];
    setFileName(file?.name ?? null);
    onChange?.();
  }

  function clearFile() {
    if (ref.current) ref.current.value = '';
    setFileName(null);
    onChange?.();
  }

  function assignFile(file: File | undefined) {
    if (!file || !ref.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    ref.current.files = dt.files;
    syncFileName();
  }

  return (
    <div>
      {label ? (
        <FieldLabel htmlFor={id} required={required}>
          {label}
        </FieldLabel>
      ) : null}
      <input
        ref={ref}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        aria-invalid={error ? true : undefined}
        onChange={syncFileName}
      />
      <div
        className={cn(
          formControlFieldGapClass,
          'relative rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center transition-[border-color,background-color] duration-150',
          dragOver ? 'border-primary bg-primary/5' : 'border-border',
          error ? formControlInvalidClass : undefined,
          disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:border-primary/50 hover:bg-muted/40'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          assignFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => {
          if (!disabled) ref.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled) ref.current?.click();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-describedby={hint ? `${id}-hint` : undefined}
      >
        <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileUp className="size-5" aria-hidden />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          {fileName ? fileName : 'Drag and drop a file, or click to browse'}
        </p>
        {hint ? (
          <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      {fileName ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className="truncate text-sm text-foreground">{fileName}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              clearFile();
            }}
            disabled={disabled}
            aria-label="Remove file"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}
      <FormFieldError message={error} />
    </div>
  );
}
