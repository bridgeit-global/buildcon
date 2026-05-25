'use client';

import dynamic from 'next/dynamic';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
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
};

export function PdfViewerDialog({
  open,
  onOpenChange,
  url,
  title = 'Document preview'
}: PdfViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-0 p-0 sm:h-[85vh]">
        <DialogHeader className="shrink-0 border-b border-ds-gray-200 px-5 py-3">
          <DialogTitle className="text-sm font-semibold text-ds-gray-800">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {url ? <PdfViewerInner src={url} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
