'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Loader2, RotateCcw, RotateCw } from 'lucide-react';
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
  rotateImageBlobCw,
  type CroppedAreaPixels
} from '@/lib/customer/kyc-crop';
import { normalizeKycDocumentImage } from '@/lib/customer/kyc-document-normalize';
import {
  runKycOcrWithAutoOrient,
  type KycOcrDocType
} from '@/lib/customer/kyc-ocr';
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
  /** Source shown in manual cropper — may be a rotated copy of `imageUrl`. */
  const [editUrl, setEditUrl] = useState(imageUrl);
  const ownedEditUrlRef = useRef<string | null>(null);
  const [pan, setPan] = useState(initialPan);
  const [aadhaar, setAadhaar] = useState(initialAadhaar);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const pixelsRef = useRef<CroppedAreaPixels | null>(null);
  const autoStartedRef = useRef(false);
  const scanInFlightRef = useRef(false);
  const scanGenRef = useRef(0);

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
    scanGenRef.current += 1;
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
    if (ownedEditUrlRef.current) {
      URL.revokeObjectURL(ownedEditUrlRef.current);
      ownedEditUrlRef.current = null;
    }
    setEditUrl(imageUrl);
    setPan(initialPan);
    setAadhaar(initialAadhaar);
    setFieldError(undefined);
    setBusy(false);
    // Only reset when a new image is opened — not when parent re-renders PAN/Aadhaar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageUrl, autoScan]);

  useEffect(() => {
    if (!open) return;
    setPan(initialPan);
    setAadhaar(initialAadhaar);
  }, [open, initialPan, initialAadhaar]);

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
      rotationDeg: 0 | 90 | 180 | 270;
    }> => {
      if (!needsId) {
        return { blob, pan: null, aadhaar: null, rotationDeg: 0 };
      }
      try {
        // Rotate only when OCR cannot read upright text.
        const ocr = await runKycOcrWithAutoOrient(blob, docType);
        return {
          blob: ocr.blob,
          pan: ocr.pan,
          aadhaar: ocr.aadhaar,
          rotationDeg: ocr.rotationDeg
        };
      } catch (e) {
        console.warn('OCR skipped', e);
        return { blob, pan: null, aadhaar: null, rotationDeg: 0 };
      }
    },
    [docType, needsId]
  );

  const finishWithBlob = useCallback(
    async (blob: Blob, file: File, methodLabel: string, gen: number) => {
      if (gen !== scanGenRef.current) return;
      setBusyLabel(needsId ? 'Reading ID with AI…' : 'Preparing image…');
      let finalBlob = blob;
      let finalFile = file;

      if (needsId) {
        try {
          const ocr = await applyOcrToState(blob);
          if (gen !== scanGenRef.current) return;
          if (ocr.blob !== blob) {
            finalBlob = ocr.blob;
            finalFile = croppedBlobToFile(ocr.blob, fileBaseName);
          }
          const rotatedNote =
            ocr.rotationDeg > 0 ? `, rotated ${ocr.rotationDeg}°` : '';
          if (docType === 'pan') {
            if (ocr.pan) {
              setPan(ocr.pan);
              toast.success(`PAN detected (${methodLabel}${rotatedNote}).`);
            } else {
              toast.warning(
                'Could not read PAN. Enter it manually after checking the crop.'
              );
            }
          } else if (docType === 'aadhaar') {
            if (ocr.aadhaar) {
              setAadhaar(ocr.aadhaar);
              toast.success(`Aadhaar detected (${methodLabel}${rotatedNote}).`);
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

      if (gen !== scanGenRef.current) return;
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
    const gen = scanGenRef.current;
    scanInFlightRef.current = true;
    setBusy(true);
    setStep('processing');
    setBusyLabel('Cropping card…');
    try {
      const normalized = await normalizeKycDocumentImage(
        imageUrl,
        docType,
        fileBaseName
      );
      if (gen !== scanGenRef.current) return;
      setBusyLabel(
        needsId ? 'Card cropped. Reading ID with AI…' : 'Card cropped…'
      );
      await finishWithBlob(
        normalized.blob,
        normalized.file,
        'auto crop',
        gen
      );
    } catch (e) {
      if (gen !== scanGenRef.current) return;
      console.error('Auto document scan failed', e);
      toast.warning(
        'Auto crop failed. Adjust the crop manually, then scan.'
      );
      setStep('crop');
    } finally {
      if (gen === scanGenRef.current) {
        scanInFlightRef.current = false;
        setBusy(false);
      }
    }
  }, [docType, fileBaseName, finishWithBlob, imageUrl, needsId]);

  // Auto-run once when dialog opens (stable deps — avoid restart loops).
  useEffect(() => {
    if (!open || !autoScan || !imageUrl) return;
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    void runAutoDocumentScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once per open/imageUrl
  }, [open, autoScan, imageUrl]);

  const runManualCropAndScan = useCallback(
    async (pixels: CroppedAreaPixels) => {
      if (scanInFlightRef.current) return;
      const gen = scanGenRef.current;
      scanInFlightRef.current = true;
      setBusy(true);
      setBusyLabel(needsId ? 'Cropping & scanning…' : 'Cropping…');
      try {
        const blob = await getCroppedImageBlob(editUrl, pixels, 0.92, 2);
        const file = croppedBlobToFile(blob, fileBaseName);
        await finishWithBlob(blob, file, 'manual crop', gen);
      } catch (e) {
        pageError(e instanceof Error ? e.message : 'Crop failed');
      } finally {
        if (gen === scanGenRef.current) {
          scanInFlightRef.current = false;
          setBusy(false);
        }
      }
    },
    [editUrl, fileBaseName, finishWithBlob, needsId]
  );

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    pixelsRef.current = pixels;
    setCroppedAreaPixels(pixels);
  }, []);

  async function rotateBlobUrl(
    sourceUrl: string,
    direction: 'cw' | 'ccw'
  ): Promise<string> {
    const res = await fetch(sourceUrl);
    const srcBlob = await res.blob();
    const rotated = await rotateImageBlobCw(
      srcBlob,
      direction === 'cw' ? 90 : 270
    );
    return URL.createObjectURL(rotated);
  }

  async function rotateEditSource(direction: 'cw' | 'ccw') {
    setBusy(true);
    setBusyLabel('Rotating…');
    try {
      const nextUrl = await rotateBlobUrl(editUrl, direction);
      if (ownedEditUrlRef.current) URL.revokeObjectURL(ownedEditUrlRef.current);
      ownedEditUrlRef.current = nextUrl;
      setEditUrl(nextUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      pixelsRef.current = null;
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Rotate failed');
    } finally {
      setBusy(false);
    }
  }

  async function rotatePreview(direction: 'cw' | 'ccw') {
    if (!croppedFile) return;
    setBusy(true);
    setBusyLabel('Rotating…');
    try {
      const blob = await rotateImageBlobCw(
        croppedFile,
        direction === 'cw' ? 90 : 270
      );
      const file = croppedBlobToFile(blob, fileBaseName);
      setCroppedFile(file);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Rotate failed');
    } finally {
      setBusy(false);
    }
  }

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
        // Always allow dismiss — cancel in-flight scan via generation bump.
        if (!next) {
          scanGenRef.current += 1;
          scanInFlightRef.current = false;
          onCancel();
        }
      }}
      title={title}
      description={
        step === 'processing'
          ? 'Cropping the card, then reading the ID with AI…'
          : step === 'crop'
            ? 'Rotate if needed, drag to frame the card, then apply crop.'
            : needsId
              ? 'Rotate or re-crop if needed, confirm the number, then upload.'
              : 'Rotate or re-crop if needed, then upload.'
      }
      className="w-[min(100vw-1rem,36rem)] sm:max-w-xl"
      contentClassName="overflow-hidden"
      footer={
        step === 'processing' ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                scanGenRef.current += 1;
                scanInFlightRef.current = false;
                setBusy(false);
                setStep('crop');
              }}
            >
              Manual crop & rotate
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : step === 'crop' ? (
          <div className="flex w-full flex-col gap-2">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-11 gap-1.5 sm:h-9 sm:min-h-9"
                disabled={busy}
                onClick={() => void rotateEditSource('ccw')}
              >
                <RotateCcw className="size-4" aria-hidden />
                Rotate left
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-11 gap-1.5 sm:h-9 sm:min-h-9"
                disabled={busy}
                onClick={() => void rotateEditSource('cw')}
              >
                <RotateCw className="size-4" aria-hidden />
                Rotate right
              </Button>
            </div>
            <FormActions
              onCancel={onCancel}
              submitLabel={needsId ? 'Apply crop & scan' : 'Apply crop'}
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
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-11 gap-1.5 sm:h-9 sm:min-h-9"
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
                className="h-11 min-h-11 gap-1.5 sm:h-9 sm:min-h-9"
                disabled={busy || !croppedFile}
                onClick={() => void rotatePreview('ccw')}
              >
                <RotateCcw className="size-4" aria-hidden />
                Rotate left
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-11 gap-1.5 sm:h-9 sm:min-h-9"
                disabled={busy || !croppedFile}
                onClick={() => void rotatePreview('cw')}
              >
                <RotateCw className="size-4" aria-hidden />
                Rotate right
              </Button>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onCancel}
              >
                Cancel
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
          </div>
        )
      }
    >
      {step === 'processing' ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl bg-ds-gray-900 px-4 py-10 text-center text-white">
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <p className="text-sm font-medium">{busyLabel}</p>
          <p className="max-w-sm text-xs text-white/70">
            Cropping the card, then reading the ID with AI.
            Rotates the image if the model reports it is sideways.
            If this takes too long, use Skip to manual.
          </p>
        </div>
      ) : null}

      {step === 'crop' ? (
        <div className="space-y-4">
          <div
            className="relative w-full overflow-hidden rounded-xl bg-ds-gray-900"
            style={{ height: 320 }}
          >
            {editUrl ? (
              <Cropper
                key={editUrl}
                image={editUrl}
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
