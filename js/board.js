// The pit board: a working device, not a chip.
// A fixed strip of letter tiles. Each beat of the page carries a data-board
// message; when a beat takes the viewport, the tiles flip to spell it, one
// tile at a time, the way a mechanic swaps plates on a real board.
// Also used standalone: any element with [data-board-static] renders its
// text as tiles once, with no flipping.

const COLS = 12;
const ALPHA = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+%.-/";
const boardReduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

function tileHTML(ch) {
  return `<span class="tile" data-ch="${ch === " " ? "&nbsp;" : ch}"><i>${ch === " " ? "&nbsp;" : ch}</i></span>`;
}

function renderStatic(el) {
  const text = (el.dataset.boardStatic || el.textContent).toUpperCase().trim();
  el.innerHTML = [...text].map(tileHTML).join("");
  el.classList.add("board");
}

document.querySelectorAll("[data-board-static]").forEach(renderStatic);

const live = document.querySelector("[data-board-live]");
if (live) {
  const cur = Array(COLS).fill(" ");
  live.innerHTML = cur.map(tileHTML).join("");
  const tiles = [...live.querySelectorAll(".tile")];
  let timers = [];

  function flipTile(i, to) {
    const t = tiles[i];
    const from = cur[i];
    cur[i] = to;
    if (boardReduce || from === to) { t.querySelector("i").textContent = to === " " ? " " : to; return; }
    // run through a few intermediate letters before landing, like a split-flap
    let steps = 3 + Math.floor(Math.random() * 3);
    const run = () => {
      const ch = steps > 0 ? ALPHA[Math.floor(Math.random() * ALPHA.length)] : to;
      t.classList.remove("flip"); void t.offsetWidth; t.classList.add("flip");
      t.querySelector("i").textContent = ch === " " ? " " : ch;
      if (steps-- > 0) timers.push(setTimeout(run, 55));
    };
    run();
  }

  function setMessage(msg) {
    timers.forEach(clearTimeout); timers = [];
    const text = msg.toUpperCase().slice(0, COLS).padEnd(COLS, " ");
    [...text].forEach((ch, i) => timers.push(setTimeout(() => flipTile(i, ch), i * 40)));
  }

  const beats = [...document.querySelectorAll("[data-board]")];
  let last = null;
  const update = () => {
    let active = beats[0];
    for (const b of beats) if (b.getBoundingClientRect().top < innerHeight * 0.5) active = b;
    if (active !== last) { last = active; setMessage(active.dataset.board); live.setAttribute("aria-label", active.dataset.board); }
  };
  addEventListener("scroll", update, { passive: true });
  update();
}
