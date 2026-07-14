const KYC_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

const KYC_DOC_MIME = new Set([...KYC_IMAGE_MIME, 'application/pdf']);

const KYC_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const KYC_DOC_EXT = new Set([...KYC_IMAGE_EXT, '.pdf']);

export const KYC_PHOTO_FILE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const KYC_ID_DOC_FILE_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp';

export function kycFileAcceptForDocType(docType: string): string {
  return docType === 'photo' ? KYC_PHOTO_FILE_ACCEPT : KYC_ID_DOC_FILE_ACCEPT;
}

export function isKycImageFile(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t && KYC_IMAGE_MIME.has(t)) return true;
  return KYC_IMAGE_EXT.has(extensionFromName(file.name));
}

export function isKycPdfFile(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t === 'application/pdf') return true;
  return extensionFromName(file.name) === '.pdf';
}

export function isKycFileAllowed(file: File, docType: string): boolean {
  const t = (file.type || '').toLowerCase();
  if (docType === 'photo') {
    if (t && KYC_IMAGE_MIME.has(t)) return true;
    const ext = extensionFromName(file.name);
    return KYC_IMAGE_EXT.has(ext);
  }
  if (t && KYC_DOC_MIME.has(t)) return true;
  const ext = extensionFromName(file.name);
  return KYC_DOC_EXT.has(ext);
}

export function kycFileRejectMessage(docType: string): string {
  return docType === 'photo'
    ? 'Photo must be a JPEG, PNG, or WebP image.'
    : 'Choose a PDF or image (JPEG, PNG, or WebP).';
}

function extensionFromName(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot >= name.length - 1) return '';
  return name.slice(dot).toLowerCase();
}
