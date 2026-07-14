'use client';

import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pageError } from '@/lib/toast';
import { FormActions } from '@/components/ui/form-actions';
import { FormDialog } from '@/components/ui/form-dialog';
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
import { FileUploadField } from '@/components/ui/file-upload-field';
import { PanInputField } from '@/components/ui/pan-input-field';
import { AadhaarInputField } from '@/components/ui/aadhaar-input-field';
import {
  KycImageCropDialog,
  type KycCropConfirmPayload
} from '@/components/ui/kyc-image-crop-dialog';
import { kycUploadSchema } from '@/lib/customer/customer-forms.schema';
import {
  isKycFileAllowed,
  isKycImageFile,
  kycFileAcceptForDocType,
  kycFileRejectMessage
} from '@/lib/customer/kyc-file';
import type { KycOcrDocType } from '@/lib/customer/kyc-ocr';
import { cn } from '@/lib/utils';

const FORM_ID = 'customer-kyc-upload-form';

const KYC_DOC_TYPES: { value: string; label: string }[] = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'photo', label: 'Photo' },
  { value: 'address_proof', label: 'Address proof' },
  { value: 'other', label: 'Other' }
];

const CROP_DOC_TYPES = new Set(['pan', 'aadhaar', 'photo']);

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
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState('');
  const [cropDocType, setCropDocType] = useState<KycOcrDocType>('aadhaar');

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

  const { control, handleSubmit, setValue, reset, getValues } = form;

  function clearCropPreview() {
    setCropOpen(false);
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
      setCropImageUrl('');
    }
  }

  useEffect(() => {
    if (open) {
      reset({
        docType: 'aadhaar',
        pan_number: initialPan,
        aadhaar_last4: initialAadhaar,
        hasFile: false
      });
      setDocType('aadhaar');
      clearCropPreview();
      if (fileRef.current) fileRef.current.value = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when dialog opens / initials change
  }, [open, initialPan, initialAadhaar, reset]);

  function syncHasFile() {
    const file = fileRef.current?.files?.[0];
    setValue('hasFile', Boolean(file), { shouldValidate: true });

    if (
      file &&
      CROP_DOC_TYPES.has(docType) &&
      isKycImageFile(file) &&
      isKycFileAllowed(file, docType)
    ) {
      if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
      setCropDocType(docType as KycOcrDocType);
      setCropImageUrl(URL.createObjectURL(file));
      setCropOpen(true);
    }
  }

  function resetOnClose() {
    reset({
      docType: 'aadhaar',
      pan_number: initialPan,
      aadhaar_last4: initialAadhaar,
      hasFile: false
    });
    setDocType('aadhaar');
    clearCropPreview();
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleCropConfirm(payload: KycCropConfirmPayload) {
    const values = getValues();
    await onUpload({
      docType: cropDocType,
      pan_number: payload.pan ?? values.pan_number ?? initialPan,
      aadhaar_last4: payload.aadhaar ?? values.aadhaar_last4 ?? initialAadhaar,
      file: payload.file
    });
    clearCropPreview();
  }

  const fileHint =
    docType === 'photo'
      ? 'JPEG, PNG, or WebP. Images open a crop & scan step.'
      : CROP_DOC_TYPES.has(docType)
        ? 'PDF or image (JPEG, PNG, WebP). Images open a crop & scan step.'
        : 'PDF or image (JPEG, PNG, WebP).';

  const showManualIdFields =
    (docType === 'pan' || docType === 'aadhaar') && !cropOpen;

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) resetOnClose();
        }}
        title="Upload KYC document"
        description="Attach identity or address proof for this customer."
        className="sm:max-w-xl"
        footer={
          <FormActions
            formId={FORM_ID}
            onCancel={() => onOpenChange(false)}
            submitLabel="Upload"
            saving={saving}
          />
        }
      >
        <form
          id={FORM_ID}
          onSubmit={(e) => {
            e.preventDefault();
            const file = fileRef.current?.files?.[0];
            if (!file) {
              setValue('hasFile', false, { shouldValidate: true });
              pageError('Choose a file to upload.');
              return;
            }
            if (!isKycFileAllowed(file, docType)) {
              pageError(kycFileRejectMessage(docType));
              if (fileRef.current) fileRef.current.value = '';
              return;
            }
            if (CROP_DOC_TYPES.has(docType) && isKycImageFile(file)) {
              if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
              setCropDocType(docType as KycOcrDocType);
              setCropImageUrl(URL.createObjectURL(file));
              setCropOpen(true);
              return;
            }
            void handleSubmit(
              async (values) => {
                await onUpload({
                  docType: values.docType,
                  pan_number: values.pan_number,
                  aadhaar_last4: values.aadhaar_last4,
                  file
                });
              },
              () => pageError('Fix the highlighted fields before uploading.')
            )();
          }}
          className="space-y-6"
        >
          <FormSection title="Document">
            <FormRow>
              <div className="md:col-span-2">
                <FieldLabel>Document type</FieldLabel>
                <Select
                  value={docType}
                  onValueChange={(v) => {
                    setDocType(v);
                    setValue('docType', v, { shouldValidate: true });
                    if (v === 'pan') setValue('pan_number', initialPan);
                    if (v === 'aadhaar') setValue('aadhaar_last4', initialAadhaar);
                    clearCropPreview();
                    if (fileRef.current) {
                      fileRef.current.accept = kycFileAcceptForDocType(v);
                      fileRef.current.value = '';
                      setValue('hasFile', false);
                    }
                  }}
                >
                  <SelectTrigger
                    className={cn(formControlFieldGapClass, formControlClass)}
                  >
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

              {showManualIdFields && docType === 'pan' ? (
                <div className="md:col-span-2">
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
                    Required for PDF uploads. Images are scanned after cropping.
                  </p>
                </div>
              ) : null}

              {showManualIdFields && docType === 'aadhaar' ? (
                <div className="md:col-span-2">
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    Required for PDF uploads. Images are scanned after cropping.
                  </p>
                </div>
              ) : null}

              <Controller
                control={control}
                name="hasFile"
                render={({ fieldState }) => (
                  <div className="md:col-span-2">
                    <FileUploadField
                      id="kyc-file-upload"
                      label="File"
                      required
                      accept={kycFileAcceptForDocType(docType)}
                      hint={fileHint}
                      error={fieldState.error?.message}
                      inputRef={fileRef}
                      onChange={syncHasFile}
                    />
                  </div>
                )}
              />
            </FormRow>
          </FormSection>
        </form>
      </FormDialog>

      {cropImageUrl ? (
        <KycImageCropDialog
          open={cropOpen}
          imageUrl={cropImageUrl}
          docType={cropDocType}
          initialPan={getValues('pan_number') || initialPan}
          initialAadhaar={getValues('aadhaar_last4') || initialAadhaar}
          fileBaseName={`${cropDocType}-crop`}
          onCancel={() => {
            clearCropPreview();
            if (fileRef.current) {
              fileRef.current.value = '';
              setValue('hasFile', false);
            }
          }}
          onConfirm={handleCropConfirm}
        />
      ) : null}
    </>
  );
}
