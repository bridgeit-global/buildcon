'use client';

import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { FormFieldError } from '@/components/ui/form-field-error';
import { PanInputField } from '@/components/ui/pan-input-field';
import { AadhaarInputField } from '@/components/ui/aadhaar-input-field';
import { kycUploadSchema } from '@/lib/customer/customer-forms.schema';
import {
  isKycFileAllowed,
  kycFileAcceptForDocType,
  kycFileRejectMessage
} from '@/lib/customer/kyc-file';

const KYC_DOC_TYPES: { value: string; label: string }[] = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'photo', label: 'Photo' },
  { value: 'address_proof', label: 'Address proof' },
  { value: 'other', label: 'Other' }
];

type UploadFormValues = {
  docType: string;
  pan_number: string;
  aadhaar_last4: string;
  hasFile: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  initialPan: string;
  initialAadhaar: string;
  onUpload: (input: {
    docType: string;
    pan_number: string;
    aadhaar_last4: string;
    file: File;
  }) => void | Promise<void>;
};

export function CustomerKycUploadDialog({
  open,
  onOpenChange,
  saving,
  initialPan,
  initialAadhaar,
  onUpload
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('aadhaar');

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(kycUploadSchema),
    defaultValues: {
      docType: 'aadhaar',
      pan_number: initialPan,
      aadhaar_last4: initialAadhaar,
      hasFile: false
    },
    mode: 'onTouched',
    reValidateMode: 'onBlur'
  });

  const { control, handleSubmit, setValue, watch, reset } = form;
  useEffect(() => {
    if (open) {
      reset({
        docType: 'aadhaar',
        pan_number: initialPan,
        aadhaar_last4: initialAadhaar,
        hasFile: false
      });
      setDocType('aadhaar');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [open, initialPan, initialAadhaar, reset]);

  function syncHasFile() {
    setValue('hasFile', Boolean(fileRef.current?.files?.[0]), {
      shouldValidate: true
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          reset({
            docType: 'aadhaar',
            pan_number: initialPan,
            aadhaar_last4: initialAadhaar,
            hasFile: false
          });
          setDocType('aadhaar');
          if (fileRef.current) fileRef.current.value = '';
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <form
          onSubmit={handleSubmit(
            async (values) => {
              const file = fileRef.current?.files?.[0];
              if (!file) return;
              if (!isKycFileAllowed(file, values.docType)) {
                pageError(kycFileRejectMessage(values.docType));
                if (fileRef.current) fileRef.current.value = '';
                return;
              }
              await onUpload({
                docType: values.docType,
                pan_number: values.pan_number,
                aadhaar_last4: values.aadhaar_last4,
                file
              });
            },
            () => pageError('Fix the highlighted fields before uploading.')
          )}
        >
          <DialogHeader>
            <DialogTitle>Upload KYC document</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <Label>Document type</Label>
              <Select
                value={docType}
                onValueChange={(v) => {
                  setDocType(v);
                  setValue('docType', v, { shouldValidate: true });
                  if (v === 'pan') setValue('pan_number', initialPan);
                  if (v === 'aadhaar') setValue('aadhaar_last4', initialAadhaar);
                  if (fileRef.current) {
                    fileRef.current.accept = kycFileAcceptForDocType(v);
                    fileRef.current.value = '';
                    setValue('hasFile', false);
                  }
                }}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KYC_DOC_TYPES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {docType === 'pan' ? (
              <div>
                <Controller
                  control={control}
                  name="pan_number"
                  render={({ field, fieldState }) => (
                    <PanInputField
                      label="PAN number"
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Stored on the customer profile when you upload.
                </p>
              </div>
            ) : null}

            {docType === 'aadhaar' ? (
              <Controller
                control={control}
                name="aadhaar_last4"
                render={({ field, fieldState }) => (
                  <AadhaarInputField
                    label="Aadhaar number"
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
            ) : null}

            <div>
              <Label>File</Label>
              <Controller
                control={control}
                name="hasFile"
                render={({ fieldState }) => (
                  <>
                    <Input
                      ref={fileRef}
                      type="file"
                      accept={kycFileAcceptForDocType(docType)}
                      onChange={syncHasFile}
                      className="mt-1 block h-auto py-1.5 text-sm text-ds-gray-600 file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
                      aria-invalid={fieldState.error ? true : undefined}
                    />
                    <FormFieldError message={fieldState.error?.message} />
                  </>
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {docType === 'photo'
                  ? 'JPEG, PNG, or WebP only.'
                  : 'PDF or image (JPEG, PNG, WebP).'}
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
