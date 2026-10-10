/*
  The livery stripe's three colours as text, in stripe order. Numbered and repeated items (services,
  work entries, team) take them in turn so the brand palette runs through the content, not only the
  stripe. Yellow leads every sequence.
*/
const LIVERY_TEXT = ["text-ember", "text-ember-hot", "text-ember-red"] as const;

export function liveryText(index: number): (typeof LIVERY_TEXT)[number] {
  return LIVERY_TEXT[index % LIVERY_TEXT.length];
}
