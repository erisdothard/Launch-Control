/*
  The livery stripe: the brand's one signature detail. Yellow leads, orange and red follow, in the
  proportions of the car's livery. Thin, short, decorative. Under the hero headline and above each
  section title on dark ground. Never on the yellow Book panel.
*/
export function LiveryStripe({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex h-[3px] w-24 ${className}`}>
      <span className="flex-[5] bg-ember" />
      <span className="flex-[3] bg-ember-hot" />
      <span className="flex-[2] bg-ember-red" />
    </div>
  );
}
