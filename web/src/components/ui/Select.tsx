import type { SelectHTMLAttributes } from "react";
import { FieldShell, controlClass } from "./Field";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label: string;
  options: readonly string[];
  placeholder: string;
  error?: string;
}

export function Select({
  id,
  label,
  options,
  placeholder,
  error,
  className = "",
  ...rest
}: SelectProps) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <select
        id={id}
        defaultValue=""
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${controlClass} ${className}`}
        {...rest}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
