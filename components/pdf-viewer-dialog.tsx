'use client';

import dynamic from 'next/dynamic';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const PdfViewerInner = dynamic(() => import('./pdf-viewer-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-ds-gray-400" />
    </div>
  )
});

type PdfViewerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  primaryActionLoading?: boolean;
};

export function PdfViewerDialog({
  open,
  onOpenChange,
  url,
  title = 'Document preview',
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled,
  primaryActionLoading
}: PdfViewerDialogProps) {
  const showPrimary = Boolean(primaryActionLabel && onPrimaryAction);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[96vh] w-[96vw] max-w-[96vw] sm:max-w-[96vw] flex-col gap-0 rounded-xl p-0">
        <DialogHeader className="shrink-0 border-b border-ds-gray-200 px-5 py-3">
          <DialogTitle className="text-sm font-semibold text-ds-gray-800">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 p-2">
          {url ? <PdfViewerInner src={url} /> : null}
        </div>
        <DialogFooter className="shrink-0 border-t border-ds-gray-200 bg-white px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {showPrimary ? (
            <Button
              type="button"
              onClick={() => onPrimaryAction?.()}
              disabled={primaryActionDisabled || primaryActionLoading}
            >
              {primaryActionLoading ? 'Sending…' : primaryActionLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
