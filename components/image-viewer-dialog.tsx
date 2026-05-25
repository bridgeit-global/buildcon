'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

type ImageViewerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
};

export function ImageViewerDialog({
  open,
  onOpenChange,
  url,
  title = 'Image preview'
}: ImageViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[90vw] max-w-3xl flex-col gap-0 rounded-xl p-0">
        <DialogHeader className="shrink-0 border-b border-ds-gray-200 px-5 py-3">
          <DialogTitle className="text-sm font-semibold text-ds-gray-800">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto flex items-center justify-center bg-ds-gray-50 p-4">
          {url ? (
            <img
              src={url}
              alt={title}
              className="max-h-full max-w-full rounded-md object-contain"
            />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-ds-gray-400" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
