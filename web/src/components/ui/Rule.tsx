/* Hairline rule. Decorative by default; pass `tone` for the success rule under a sent form. */
export interface RuleProps {
  tone?: "border" | "success" | "ember";
  className?: string;
}

const tones: Record<NonNullable<RuleProps["tone"]>, string> = {
  border: "border-border",
  success: "border-success",
  ember: "border-ember",
};

export function Rule({ tone = "border", className = "" }: RuleProps) {
  return <hr aria-hidden="true" className={`m-0 border-0 border-t ${tones[tone]} ${className}`} />;
}
