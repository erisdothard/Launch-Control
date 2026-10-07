/*
  Early start: the gate is server-rendered, so START and SKIP are on screen before React hydrates.
  A press in that window has no handler and is lost. This inline script, run from the HTML before
  any bundle loads, records the press; Experience consumes it once its handlers exist and routes it
  through the same queue a press during `loading` uses.
*/

export type EarlyPress = "start" | "skip";

declare global {
  interface Window {
    __lcEarly?: EarlyPress;
    __lcEarlyOff?: () => void;
  }
}

export const EARLY_START_SCRIPT = `(function(){
  function onClick(e){
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    if (t.closest('[data-testid="start-button"]')) window.__lcEarly = "start";
    else if (t.closest('[data-testid="skip-link"]')) window.__lcEarly = "skip";
  }
  document.addEventListener("click", onClick, true);
  window.__lcEarlyOff = function(){ document.removeEventListener("click", onClick, true); };
})();`;

/** Stops recording and returns the press that arrived before hydration, if any. */
export function consumeEarlyPress(): EarlyPress | null {
  window.__lcEarlyOff?.();
  const press = window.__lcEarly ?? null;
  delete window.__lcEarly;
  delete window.__lcEarlyOff;
  return press;
}
