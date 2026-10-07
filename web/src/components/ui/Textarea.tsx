import type { TextareaHTMLAttributes } from "react";
import { FieldShell, controlClass } from "./Field";

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id: string;
  label: string;
  error?: string;
}

export function Textarea({ id, label, error, className = "", ...rest }: TextareaProps) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${controlClass} resize-y ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}
