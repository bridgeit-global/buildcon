'use client';

import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

type PdfViewerInnerProps = {
  src: string;
};

export default function PdfViewerInner({ src }: PdfViewerInnerProps) {
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  return (
    <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
      <div style={{ height: '100%' }}>
        <Viewer fileUrl={src} plugins={[defaultLayoutPluginInstance]} />
      </div>
    </Worker>
  );
}
