// Drives the .bloom-btn micro-interaction (see css/bloom-button.css):
// spawns the leaf/dust/petal elements the CSS keyframes animate via
// --x/--angle/--delay/--r, toggles .is-blooming for their duration, and
// calls the real generate handler alongside the animation.

const LEAF_PATH = "M7 19C2 14 1 6 7 0c6 6 5 14 0 19Z";

// Longest-running child animation: the petal-center dot starts at 760ms
// and runs 400ms — .is-blooming must stay on the button at least that long.
// Exported so callers (e.g. app.js) can delay anything that would move the
// button out of view — like scrolling to results — until it's finished.
export const BLOOM_DURATION_MS = 1200;

function makeLeaf({ x, angle, delay, alt }) {
  const el = document.createElement("span");
  el.className = alt ? "leaf --alt" : "leaf";
  el.style.setProperty("--x", `${x}%`);
  el.style.setProperty("--angle", `${angle}deg`);
  el.style.setProperty("--delay", `${delay}ms`);
  el.innerHTML = `<svg viewBox="0 0 14 19"><path d="${LEAF_PATH}"/></svg>`;
  return el;
}

function makeDust({ x, delay }) {
  const el = document.createElement("span");
  el.className = "dust";
  el.style.setProperty("--x", `${x}%`);
  el.style.setProperty("--delay", `${delay}ms`);
  return el;
}

function makePetalCluster(petalCount) {
  const cluster = document.createElement("span");
  cluster.className = "petal-cluster";
  for (let i = 0; i < petalCount; i++) {
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.setProperty("--r", `${(360 / petalCount) * i}deg`);
    cluster.appendChild(petal);
  }
  const center = document.createElement("span");
  center.className = "petal-center";
  cluster.appendChild(center);
  return cluster;
}

export function initBloomButton(btn, onGenerate, { statusEl, leafCount = 5, dustCount = 6, petalCount = 6 } = {}) {
  const fx = btn.querySelector(".bloom-btn__fx");
  let animating = false;

  function announce(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function spawnFx() {
    fx.innerHTML = "";
    for (let i = 0; i < leafCount; i++) {
      fx.appendChild(
        makeLeaf({
          x: 32 + Math.random() * 36,
          angle: -22 + Math.random() * 44,
          delay: i * 55 + Math.random() * 40,
          alt: i % 2 === 1,
        })
      );
    }
    for (let i = 0; i < dustCount; i++) {
      fx.appendChild(makeDust({ x: 15 + Math.random() * 70, delay: Math.random() * 180 }));
    }
    fx.appendChild(makePetalCluster(petalCount));
  }

  btn.addEventListener("click", async () => {
    if (animating || btn.disabled) return;
    animating = true;
    spawnFx();
    btn.classList.add("is-blooming");
    announce("Generating…");

    try {
      await onGenerate?.();
    } finally {
      setTimeout(() => {
        btn.classList.remove("is-blooming");
        animating = false;
        announce("Done");
      }, BLOOM_DURATION_MS);
    }
  });
}
