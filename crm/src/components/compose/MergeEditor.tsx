"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { fieldLabel, normalizeField } from "@/lib/email/merge";

// A text box that shows merge fields as pills ("First name") instead of {{first_name|there}}.
// The value in and out is the same plain text the server merges, codes and fallbacks intact: the
// pill only hides the syntax. The DOM is owned here, not by React, so typing never re-renders it.

// Same pattern as src/lib/email/merge.ts, which doesn't export its regex.
const TOKEN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_ ]*?)\s*(?:\|([^}]*))?\}\}/g;

const CHIP_CLASS =
  "mx-[1px] inline-block rounded-full bg-[var(--color-steel)]/[0.16] px-2 align-baseline text-[0.88em] leading-[1.6] font-medium whitespace-nowrap text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-steel)] select-none";

export interface MergeEditorHandle {
  /** Puts a {{field}} code at the cursor (or the end) and shows it as a pill. */
  insert: (token: string) => void;
}

interface MergeEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** One line, like a subject: Enter does nothing and pasted line breaks become spaces. */
  singleLine?: boolean;
  className?: string;
  /** id of the visible label. */
  labelledBy: string;
}

function chipFor(token: string, field: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.token = token;
  span.className = CHIP_CLASS;
  span.textContent = fieldLabel(normalizeField(field));
  return span;
}

/** Text (with line breaks) and pills, from the stored value. */
function fill(root: HTMLElement, value: string) {
  const nodes: Node[] = [];
  const pushText = (text: string) => {
    text.split("\n").forEach((part, i) => {
      if (i > 0) nodes.push(document.createElement("br"));
      if (part) nodes.push(document.createTextNode(part));
    });
  };
  let last = 0;
  for (const m of value.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    pushText(value.slice(last, at));
    nodes.push(chipFor(m[0], m[1]));
    last = at + m[0].length;
  }
  pushText(value.slice(last));
  // A trailing line break only shows with a placeholder <br> after it.
  if (value.endsWith("\n")) nodes.push(document.createElement("br"));
  root.replaceChildren(...nodes);
}

/** The stored value, back out of the DOM. A final <br> is the browser's placeholder, not a line. */
function serialize(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    const kids = [...node.childNodes];
    kids.forEach((child, i) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child.textContent ?? "").replace(/​/g, "").replace(/ /g, " ");
        return;
      }
      if (!(child instanceof HTMLElement)) return;
      if (child.dataset.token) out += child.dataset.token;
      else if (child.tagName === "BR") {
        if (!(i === kids.length - 1 && node === root)) out += "\n";
      } else if (child.tagName === "DIV" || child.tagName === "P") {
        // Browsers sometimes wrap new lines in blocks; each block starts a line.
        if (out && !out.endsWith("\n")) out += "\n";
        walk(child);
      } else walk(child);
    });
  };
  walk(root);
  return out;
}

const MergeEditor = forwardRef<MergeEditorHandle, MergeEditorProps>(function MergeEditor({ id, value, onChange, singleLine = false, className = "", labelledBy }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  const range = useRef<Range | null>(null);

  // Draw from the value whenever it changes from outside (a template, a draft, a reset).
  useEffect(() => {
    const el = root.current;
    if (!el || value === emitted.current) return;
    fill(el, value);
    emitted.current = value;
  }, [value]);

  // Remember where the cursor was, so "Insert name" lands there after the button takes focus.
  useEffect(() => {
    const onSelection = () => {
      const sel = document.getSelection();
      const el = root.current;
      if (!sel || !sel.rangeCount || !el) return;
      const r = sel.getRangeAt(0);
      if (el.contains(r.commonAncestorContainer)) range.current = r.cloneRange();
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);

  function emit() {
    const el = root.current;
    if (!el) return;
    let next = serialize(el);
    if (singleLine) next = next.replace(/[\r\n]+/g, " ");
    emitted.current = next;
    onChange(next);
  }

  useImperativeHandle(ref, () => ({
    insert(token: string) {
      const el = root.current;
      if (!el) return;
      const m = [...token.matchAll(TOKEN)][0];
      if (!m) return;
      const chip = chipFor(token, m[1]);
      const space = document.createTextNode(" ");
      const r = range.current && el.contains(range.current.commonAncestorContainer) ? range.current : null;
      if (r) {
        r.deleteContents();
        r.insertNode(space);
        r.insertNode(chip);
      } else {
        // No cursor yet: add it at the end, after a space.
        const trailing = el.lastChild;
        if (trailing instanceof HTMLBRElement && !singleLine && el.childNodes.length > 1) trailing.remove();
        if (el.textContent && !/\s$/.test(el.textContent)) el.append(document.createTextNode(" "));
        el.append(chip, space);
      }
      el.focus();
      const sel = document.getSelection();
      const after = document.createRange();
      after.setStartAfter(space);
      after.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(after);
      emit();
    },
  }));

  return (
    <div
      id={id}
      ref={root}
      role="textbox"
      aria-multiline={!singleLine}
      aria-labelledby={labelledBy}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className={`field cursor-text break-words whitespace-pre-wrap outline-none ${className}`}
      onInput={emit}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (!singleLine) document.execCommand("insertLineBreak");
      }}
      onPaste={(e) => {
        // Plain text only, so no stray formatting reaches the email.
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
        if (singleLine) document.execCommand("insertText", false, text.replace(/\n+/g, " "));
        else
          text.split("\n").forEach((line, i) => {
            if (i > 0) document.execCommand("insertLineBreak");
            if (line) document.execCommand("insertText", false, line);
          });
        // Pasted {{codes}} turn into pills too.
        const el = root.current;
        if (el && /\{\{[^}]+\}\}/.test(text)) {
          fill(el, serialize(el));
          const end = document.createRange();
          end.selectNodeContents(el);
          end.collapse(false);
          document.getSelection()?.removeAllRanges();
          document.getSelection()?.addRange(end);
          emit();
        }
      }}
      onDrop={(e) => e.preventDefault()}
    />
  );
});

export default MergeEditor;
