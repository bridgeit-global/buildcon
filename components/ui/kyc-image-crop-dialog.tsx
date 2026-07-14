'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Loader2 } from 'lucide-react';
import { FormDialog } from '@/components/ui/form-dialog';
import { FormActions } from '@/components/ui/form-actions';
import { FieldLabel } from '@/components/ui/field-label';
import { Button } from '@/components/ui/button';
import { PanInputField } from '@/components/ui/pan-input-field';
import { AadhaarInputField } from '@/components/ui/aadhaar-input-field';
import {
  croppedBlobToFile,
  getCroppedImageBlob,
  kycCropAspectRatio,
  type CroppedAreaPixels
} from '@/lib/customer/kyc-crop';
import { normalizeKycDocumentImage } from '@/lib/customer/kyc-document-normalize';
import { runKycOcr, type KycOcrDocType } from '@/lib/customer/kyc-ocr';
import {
  isAadhaarValid,
  isPanValid,
  normalizeAadhaar,
  normalizePan
} from '@/lib/customer/kyc-identifiers';
import { pageError, toast } from '@/lib/toast';

export type KycCropConfirmPayload = {
  file: File;
  pan?: string;
  aadhaar?: string;
};

type Props = {
  open: boolean;
  imageUrl: string;
  docType: KycOcrDocType;
  initialPan?: string;
  initialAadhaar?: string;
  fileBaseName?: string;
  /** When true (default), detect card corners, rotate, crop, and OCR automatically. */
  autoScan?: boolean;
  onCancel: () => void;
  onConfirm: (payload: KycCropConfirmPayload) => void | Promise<void>;
};

type Step = 'processing' | 'crop' | 'review';

/** Rotate JPEG blob 180° (flip landscape orientation if OCR failed). */
async function rotateBlob180(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Rotate failed'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Encode failed'))),
        'image/jpeg',
        0.92
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function KycImageCropDialog({
  open,
  imageUrl,
  docType,
  initialPan = '',
  initialAadhaar = '',
  fileBaseName = 'kyc-crop',
  autoScan = true,
  onCancel,
  onConfirm
}: Props) {
  const [step, setStep] = useState<Step>(autoScan ? 'processing' : 'crop');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] =
    useState<CroppedAreaPixels | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Working…');
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pan, setPan] = useState(initialPan);
  const [aadhaar, setAadhaar] = useState(initialAadhaar);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const pixelsRef = useRef<CroppedAreaPixels | null>(null);
  const autoStartedRef = useRef(false);
  const scanInFlightRef = useRef(false);

  const aspect = kycCropAspectRatio(docType);
  const needsId = docType === 'pan' || docType === 'aadhaar';
  const title =
    docType === 'pan'
      ? 'Scan PAN card'
      : docType === 'aadhaar'
        ? 'Scan Aadhaar card'
        : 'Crop photo';

  useEffect(() => {
    if (!open) return;
    setStep(autoScan ? 'processing' : 'crop');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    pixelsRef.current = null;
    autoStartedRef.current = false;
    scanInFlightRef.current = false;
    setCroppedFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPan(initialPan);
    setAadhaar(initialAadhaar);
    setFieldError(undefined);
    setBusy(false);
  }, [open, imageUrl, initialPan, initialAadhaar, docType, autoScan]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const applyOcrToState = useCallback(
    async (
      blob: Blob
    ): Promise<{
      blob: Blob;
      pan: string | null;
      aadhaar: string | null;
    }> => {
      if (!needsId) {
        return { blob, pan: null, aadhaar: null };
      }
      let ocr = await runKycOcr(blob, docType);
      let working = blob;

      // If sideways/upside-down after landscape fix, try 180° flip.
      const found =
        (docType === 'pan' && ocr.pan) || (docType === 'aadhaar' && ocr.aadhaar);
      if (!found) {
        working = await rotateBlob180(blob);
        ocr = await runKycOcr(working, docType);
      }
      return { blob: working, pan: ocr.pan, aadhaar: ocr.aadhaar };
    },
    [docType, needsId]
  );

  const finishWithBlob = useCallback(
    async (blob: Blob, file: File, methodLabel: string) => {
      setBusyLabel(
        needsId ? 'Reading PAN / Aadhaar…' : 'Preparing image…'
      );
      let finalBlob = blob;
      let finalFile = file;

      if (needsId) {
        try {
          const ocr = await applyOcrToState(blob);
          if (ocr.blob && ocr.blob !== blob) {
            finalBlob = ocr.blob;
            finalFile = croppedBlobToFile(ocr.blob, fileBaseName);
          }
          if (docType === 'pan') {
            if (ocr.pan) {
              setPan(ocr.pan);
              toast.success(`PAN detected (${methodLabel}).`);
            } else {
              toast.warning(
                'Could not read PAN. Enter it manually after checking the crop.'
              );
            }
          } else if (docType === 'aadhaar') {
            if (ocr.aadhaar) {
              setAadhaar(ocr.aadhaar);
              toast.success(`Aadhaar detected (${methodLabel}).`);
            } else {
              toast.warning(
                'Could not read Aadhaar. Enter it manually after checking the crop.'
              );
            }
          }
        } catch (e) {
          console.error('KYC OCR failed', e);
          toast.warning(
            e instanceof Error
              ? `OCR failed: ${e.message}`
              : 'OCR failed. You can still enter the number and upload.'
          );
        }
      }

      setCroppedFile(finalFile);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(finalBlob);
      });
      setStep('review');
    },
    [applyOcrToState, docType, fileBaseName, needsId]
  );

  const runAutoDocumentScan = useCallback(async () => {
    if (scanInFlightRef.current) return;
    scanInFlightRef.current = true;
    setBusy(true);
    setStep('processing');
    setBusyLabel('Detecting card corners…');
    try {
      const normalized = await normalizeKycDocumentImage(
        imageUrl,
        docType,
        fileBaseName
      );
      setBusyLabel(
        normalized.method === 'corners'
          ? 'Corner crop done. Scanning…'
          : 'Card cropped. Scanning…'
      );
      await finishWithBlob(
        normalized.blob,
        normalized.file,
        normalized.method === 'corners' ? 'corner crop' : 'auto crop'
      );
    } catch (e) {
      console.error('Auto document scan failed', e);
      toast.warning(
        'Auto card detect failed. Adjust the crop manually, then scan.'
      );
      setStep('crop');
    } finally {
      scanInFlightRef.current = false;
      setBusy(false);
    }
  }, [docType, fileBaseName, finishWithBlob, imageUrl]);

  // Auto-run corner detect + OCR when dialog opens.
  useEffect(() => {
    if (!open || !autoScan || !imageUrl || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void runAutoDocumentScan();
  }, [open, autoScan, imageUrl, runAutoDocumentScan]);

  const runManualCropAndScan = useCallback(
    async (pixels: CroppedAreaPixels) => {
      if (scanInFlightRef.current) return;
      scanInFlightRef.current = true;
      setBusy(true);
      setBusyLabel(needsId ? 'Cropping & scanning…' : 'Cropping…');
      try {
        const blob = await getCroppedImageBlob(imageUrl, pixels, 0.92, 2);
        const file = croppedBlobToFile(blob, fileBaseName);
        await finishWithBlob(blob, file, 'manual crop');
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Crop failed');
      } finally {
        scanInFlightRef.current = false;
        setBusy(false);
      }
    },
    [fileBaseName, finishWithBlob, imageUrl, needsId]
  );

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    pixelsRef.current = pixels;
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedFile) {
      pageError('Crop the image before uploading.');
      return;
    }
    if (docType === 'pan') {
      const panNorm = normalizePan(pan);
      if (!isPanValid(panNorm)) {
        setFieldError('Enter a valid PAN (e.g. ABCDE1234F).');
        return;
      }
      setFieldError(undefined);
      setBusy(true);
      setBusyLabel('Uploading…');
      try {
        await onConfirm({ file: croppedFile, pan: panNorm });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (docType === 'aadhaar') {
      const a4 = normalizeAadhaar(aadhaar);
      if (!isAadhaarValid(a4)) {
        setFieldError('Aadhaar must be 12 digits.');
        return;
      }
      setFieldError(undefined);
      setBusy(true);
      setBusyLabel('Uploading…');
      try {
        await onConfirm({ file: croppedFile, aadhaar: a4 });
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setBusyLabel('Uploading…');
    try {
      await onConfirm({ file: croppedFile });
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
      title={title}
      description={
        step === 'processing'
          ? 'Detecting card edges, rotating if needed, then reading details…'
          : step === 'crop'
            ? 'Drag to frame the card, then crop & scan.'
            : needsId
              ? 'Confirm the number, then upload.'
              : 'Preview the crop, then upload.'
      }
      className="w-[min(100vw-1rem,36rem)] sm:max-w-xl"
      contentClassName="overflow-hidden"
      footer={
        step === 'processing' ? (
          <FormActions
            onCancel={onCancel}
            submitLabel="Working…"
            saving
            submitType="button"
            disabled
          />
        ) : step === 'crop' ? (
          <FormActions
            onCancel={onCancel}
            submitLabel={needsId ? 'Crop & scan' : 'Apply crop'}
            saving={busy}
            submitType="button"
            onSubmitClick={() => {
              const pixels = pixelsRef.current ?? croppedAreaPixels;
              if (!pixels) {
                pageError('Wait for the image to load.');
                return;
              }
              void runManualCropAndScan(pixels);
            }}
            disabled={busy || !(pixelsRef.current || croppedAreaPixels)}
          />
        ) : (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setStep('crop');
                setFieldError(undefined);
              }}
            >
              Manual crop
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                autoStartedRef.current = false;
                void runAutoDocumentScan();
              }}
            >
              Re-detect
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void handleConfirm()}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {busyLabel}
                </>
              ) : (
                'Upload'
              )}
            </Button>
          </div>
        )
      }
    >
      {step === 'processing' ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl bg-ds-gray-900 px-4 py-10 text-center text-white">
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <p className="text-sm font-medium">{busyLabel}</p>
          <p className="max-w-sm text-xs text-white/70">
            The system is detecting card corners to automatically rotate and crop the image.
       
          </p>
        </div>
      ) : null}

      {step === 'crop' ? (
        <div className="space-y-4">
          <div
            className="relative w-full overflow-hidden rounded-xl bg-ds-gray-900"
            style={{ height: 320 }}
          >
            {imageUrl ? (
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                objectFit="contain"
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : null}
            {busy ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
                <Loader2 className="size-8 animate-spin" aria-hidden />
                <p className="text-sm font-medium">{busyLabel}</p>
              </div>
            ) : null}
          </div>
          <div>
            <FieldLabel htmlFor="kyc-crop-zoom">Zoom</FieldLabel>
            <input
              id="kyc-crop-zoom"
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={busy}
              className="mt-2 h-11 w-full accent-primary sm:h-8"
            />
          </div>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-4">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Cropped card preview"
              className="mx-auto max-h-56 w-auto rounded-lg border border-border object-contain"
            />
          ) : null}
          {docType === 'pan' ? (
            <PanInputField
              label="PAN number"
              required
              value={pan}
              onChange={(v) => {
                setPan(v);
                setFieldError(undefined);
              }}
              error={fieldError}
            />
          ) : null}
          {docType === 'aadhaar' ? (
            <AadhaarInputField
              label="Aadhaar number"
              required
              value={aadhaar}
              onChange={(v) => {
                setAadhaar(v);
                setFieldError(undefined);
              }}
              error={fieldError}
            />
          ) : null}
          {busy ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {busyLabel}
            </p>
          ) : null}
        </div>
      ) : null}
    </FormDialog>
  );
}
