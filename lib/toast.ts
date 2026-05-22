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

type Listener = () => void;

let toasts: ToastRecord[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function genId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeInput(input: ToastInput | string): ToastInput {
  if (typeof input === 'string') {
    return { title: input };
  }
  return input;
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
  const normalized = normalizeInput(input);
  const record: ToastRecord = {
    id: normalized.id ?? genId(),
    title: normalized.title,
    description: normalized.description,
    severity: normalized.severity ?? severity ?? 'default',
    duration: normalized.duration ?? DEFAULT_DURATION_MS,
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
  const description = String(message ?? '').trim();
  if (!description) return;
  if (title?.trim()) {
    toast.error({ title: title.trim(), description });
    return;
  }
  toast.error(description);
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
