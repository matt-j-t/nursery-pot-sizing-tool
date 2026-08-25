// Sprout Button — ES module, no dependencies.
//
// initBloomButton(buttonEl, onGenerate) wires the click flourish onto an
// existing <button>. Hovering already triggers the CSS (see
// bloom-button.css); this just makes the same ".is-active" state fire
// briefly on click too, so touch and keyboard activation (Enter/Space) get
// the flourish, not only a sustained mouse hover.
//
// On every click:
//   1. fires onGenerate() immediately (the real STL-generation call) — the
//      flourish never gates or delays it
//   2. toggles .is-active for `duration` ms (skipped/shortened under
//      prefers-reduced-motion)
//
// Markup expected (see docs/index.html):
//   <button class="bloom-btn">
//     Generate pot
//     <svg class="leaf leaf-1" ...></svg> ... <svg class="leaf leaf-10" ...></svg>
//   </button>

export const DEFAULT_DURATION_MS = 950;
export const DEFAULT_REDUCED_DURATION_MS = 250;

/**
 * @param {HTMLButtonElement} buttonEl
 * @param {() => void} [onGenerate] - the real generate/STL-export handler
 * @param {{ duration?: number, reducedDuration?: number }} [opts]
 */
export function initBloomButton(buttonEl, onGenerate, opts = {}) {
  const duration = opts.duration ?? DEFAULT_DURATION_MS;
  const reducedDuration = opts.reducedDuration ?? DEFAULT_REDUCED_DURATION_MS;

  let clearTimer = null;

  buttonEl.addEventListener("click", () => {
    if (typeof onGenerate === "function") onGenerate();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    buttonEl.classList.remove("is-active");
    void buttonEl.offsetWidth; // force reflow so back-to-back clicks restart cleanly
    buttonEl.classList.add("is-active");

    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      buttonEl.classList.remove("is-active");
    }, reduced ? reducedDuration : duration);
  });
}
