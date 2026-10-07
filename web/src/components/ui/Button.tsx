import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/* Square, ember ground, background label. 48px minimum height. Focus ring from globals.css. */
export function Button({ className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 cursor-pointer items-center justify-center rounded-none bg-ember px-8 font-display text-[13px] uppercase tracking-signage text-background transition-colors duration-fast ease-ui hover:bg-text active:bg-muted disabled:cursor-not-allowed disabled:bg-subtle ${className}`}
      {...rest}
    />
  );
}
