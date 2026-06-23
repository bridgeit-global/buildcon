import { userFacingError } from '@/lib/utils';

export type ToastSeverity = 'default' | 'success' | 'error' | 'warning' | 'info';

export type ToastInput = {
  id?: string;
  title?: string;
  description?: string;
  severity?: ToastSeverity;
  duration?: number;
};

export type ToastRecord = ToastInput & {
  id: string;
  severity: ToastSeverity;
  duration: number;
  createdAt: number;
};

const DEFAULT_DURATION_MS = 5000;

const DEFAULT_ERROR_FALLBACK = 'Something went wrong. Please try again.';

const DEFAULT_TOAST_TITLES: Record<ToastSeverity, string> = {
  default: 'Notice',
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info'
};

type Listener = () => void;

let toasts: ToastRecord[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function genId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeErrorDescription(description: string, title: string, defaultTitle: string) {
  const fallback =
    title && title !== defaultTitle ? title : DEFAULT_ERROR_FALLBACK;
  return userFacingError(description, fallback);
}

/** Ensures every toast has a title and description for consistent UI. */
function normalizeInput(
  input: ToastInput | string,
  severity: ToastSeverity
): Required<Pick<ToastInput, 'title' | 'description'>> {
  const defaultTitle = DEFAULT_TOAST_TITLES[severity];

  if (typeof input === 'string') {
    const raw = input.trim() || defaultTitle;
    if (severity === 'error') {
      return {
        title: defaultTitle,
        description: sanitizeErrorDescription(raw, defaultTitle, defaultTitle)
      };
    }
    return { title: defaultTitle, description: raw };
  }

  const title = input.title?.trim() ?? '';
  const description = input.description?.trim() ?? '';

  const maybeSanitize = (desc: string, tit: string) =>
    severity === 'error'
      ? sanitizeErrorDescription(desc, tit, defaultTitle)
      : desc;

  if (title && description) {
    return { title, description: maybeSanitize(description, title) };
  }
  if (title) {
    return { title, description: maybeSanitize(title, title) };
  }
  if (description) {
    return {
      title: defaultTitle,
      description: maybeSanitize(description, defaultTitle)
    };
  }
  return { title: defaultTitle, description: defaultTitle };
}

export function subscribeToToasts(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts() {
  return toasts;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function pushToast(input: ToastInput | string, severity?: ToastSeverity) {
  const resolvedSeverity =
    (typeof input === 'object' ? input.severity : undefined) ?? severity ?? 'default';
  const { title, description } = normalizeInput(input, resolvedSeverity);
  const record: ToastRecord = {
    id: (typeof input === 'object' ? input.id : undefined) ?? genId(),
    title,
    description,
    severity: resolvedSeverity,
    duration:
      (typeof input === 'object' ? input.duration : undefined) ?? DEFAULT_DURATION_MS,
    createdAt: Date.now()
  };
  toasts = [record, ...toasts].slice(0, 8);
  emit();
  if (record.duration > 0) {
    window.setTimeout(() => dismissToast(record.id), record.duration);
  }
  return record.id;
}

type ToastCallable = {
  (input: ToastInput | string): string;
  default: (input: ToastInput | string) => string;
  success: (input: ToastInput | string) => string;
  error: (input: ToastInput | string) => string;
  warning: (input: ToastInput | string) => string;
  info: (input: ToastInput | string) => string;
  dismiss: typeof dismissToast;
};

/** Replaces legacy page-level `setError` banners. */
export function pageError(message: string, title?: string) {
  const resolvedTitle = title?.trim() || DEFAULT_TOAST_TITLES.error;
  const description = userFacingError(
    String(message ?? ''),
    resolvedTitle === DEFAULT_TOAST_TITLES.error
      ? DEFAULT_ERROR_FALLBACK
      : resolvedTitle
  );
  toast.error({
    title: resolvedTitle,
    description
  });
}

export const toast: ToastCallable = Object.assign(
  (input: ToastInput | string) => pushToast(input),
  {
    default: (input: ToastInput | string) => pushToast(input, 'default'),
    success: (input: ToastInput | string) => pushToast(input, 'success'),
    error: (input: ToastInput | string) => pushToast(input, 'error'),
    warning: (input: ToastInput | string) => pushToast(input, 'warning'),
    info: (input: ToastInput | string) => pushToast(input, 'info'),
    dismiss: dismissToast
  }
);
