export function FormFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-0.5 text-xs text-ds-error-600">{message}</p>;
}
