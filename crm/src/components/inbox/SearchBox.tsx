"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon } from "./icons";

const DEBOUNCE_MS = 350;

/** Search lives in the URL (?q=), so Back and shared links keep it. */
export default function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("q") ?? "";
  const [value, setValue] = useState(current);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function push(next: string) {
    const p = new URLSearchParams(params.toString());
    if (next.trim()) p.set("q", next.trim());
    else p.delete("q");
    p.delete("page");
    p.delete("thread");
    p.delete("draft");
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        push(value);
      }}
      className="relative"
    >
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--color-text-dim)]">
        <SearchIcon />
      </span>
      <label htmlFor="inbox-search" className="sr-only">
        Search mail
      </label>
      <input
        id="inbox-search"
        type="search"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => push(next), DEBOUNCE_MS);
        }}
        placeholder={placeholder}
        className="field pl-11"
      />
    </form>
  );
}
