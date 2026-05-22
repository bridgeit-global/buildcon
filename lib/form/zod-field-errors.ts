import { useCallback, useMemo, useState } from 'react';
import type { z } from 'zod';

export function zodFieldErrors<T extends string>(
  result: z.ZodSafeParseResult<unknown>
): Partial<Record<T, string>> {
  if (result.success) return {};
  const out: Partial<Record<T, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in out)) {
      out[key as T] = issue.message;
    }
  }
  return out;
}

/** Live field errors: show after touch or failed submit. */
export function useFieldValidation<T extends string, V>(
  schema: z.ZodType<V>,
  values: V
) {
  const [touched, setTouched] = useState<Partial<Record<T, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const errors = useMemo(
    () => zodFieldErrors<T>(schema.safeParse(values)),
    [schema, values]
  );

  const fieldError = useCallback(
    (field: T) => {
      if (!submitAttempted && !touched[field]) return undefined;
      return errors[field];
    },
    [submitAttempted, touched, errors]
  );

  const touch = useCallback((field: T) => {
    setTouched((t) => ({ ...t, [field]: true }));
  }, []);

  const validate = useCallback(() => {
    setSubmitAttempted(true);
    return schema.safeParse(values);
  }, [schema, values]);

  const resetValidation = useCallback(() => {
    setTouched({});
    setSubmitAttempted(false);
  }, []);

  return {
    fieldError,
    touch,
    validate,
    resetValidation,
    errors,
    submitAttempted
  };
}
