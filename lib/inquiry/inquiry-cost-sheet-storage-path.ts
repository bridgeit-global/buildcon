export function inquiryCostSheetStoragePath(opts: {
  projectId: string;
  inquiryId: string;
  unitId: string;
  fileId: string;
}): string {
  const stem = `cost-sheet--${opts.unitId}--${opts.fileId}`;
  return `documents/project/${opts.projectId}/inquiry-cost-sheet/${opts.inquiryId}/${stem}.pdf`;
}
