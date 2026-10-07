import type { InputHTMLAttributes, ReactNode } from "react";

/* Shared chrome for input, select and textarea: elevated ground, 1px subtle border,
   2px ember border on focus (inset so the box never shifts), danger border when invalid. */
export const controlClass =
  "block w-full min-h-12 rounded-none border border-subtle bg-elevated px-4 py-3 font-body text-body text-text transition-colors duration-fast ease-ui placeholder:text-subtle focus:border-ember focus:[box-shadow:inset_0_0_0_1px_var(--color-ember)] aria-invalid:border-danger aria-invalid:[box-shadow:inset_0_0_0_1px_var(--color-danger)]";

export interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}

/* Label above, control, inline error below. The error id is `${id}-error`. */
export function FieldShell({ id, label, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label-mono text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  error?: string;
}

export function Field({ id, label, error, className = "", ...rest }: FieldProps) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${controlClass} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}
