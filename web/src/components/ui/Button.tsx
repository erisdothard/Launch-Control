import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/* Square, ember ground, background label. 48px minimum height. Focus ring from globals.css. */
const BASE =
  "inline-flex min-h-12 cursor-pointer items-center justify-center rounded-none px-8 font-display text-[13px] uppercase tracking-signage no-underline transition-colors duration-fast ease-ui";
const PRIMARY = `${BASE} bg-ember text-background hover:bg-text active:bg-muted disabled:cursor-not-allowed disabled:bg-subtle`;
/* Dark button for the yellow panel. A separate look, not an override: two bg utilities on one element
   resolve by stylesheet order, not class order, and the yellow won (an invisible submit button). */
const INVERSE = `${BASE} bg-background text-ember hover:bg-text hover:text-background active:bg-elevated disabled:cursor-not-allowed disabled:bg-subtle`;
const SECONDARY = `${BASE} border border-steel/40 text-steel hover:border-text hover:text-text active:bg-elevated`;

export function Button({
  className = "",
  type = "button",
  variant = "primary",
  ...rest
}: ButtonProps & { variant?: "primary" | "inverse" }) {
  return <button type={type} className={`${variant === "inverse" ? INVERSE : PRIMARY} ${className}`} {...rest} />;
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: "primary" | "secondary" };

/* The same two looks as an <a>, for calls to action that navigate. */
export function ButtonLink({ className = "", variant = "primary", ...rest }: ButtonLinkProps) {
  return <a className={`${variant === "primary" ? PRIMARY : SECONDARY} ${className}`} {...rest} />;
}
