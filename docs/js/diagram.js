// Live labeled cross-section diagram — mirrors the design handoff's SVG
// (design_handoff_nursery_pot_sizing/1a-reference.html) but computes real
// proportions from the current field values / computed liner spec instead
// of hardcoding one static shape, so it visibly rescales as the user types.
//
// Outer dashed trapezoid = the decorative pot cavity as measured/entered.
// Inner solid trapezoid  = the computed liner (only drawn once inputs are
// valid enough to size a liner).

const VIEW_W = 230;
const VIEW_H = 260;
const AVAIL_W = 170; // px budget for the widest diameter
const AVAIL_H = 170; // px budget for the outer depth
const ORIGIN_X = 115;
const TOP_Y = 46;

function layoutTrapezoid(dims, scale) {
  const topHalf = (dims.topDiam / 2) * scale;
  const botHalf = ((dims.bottomDiam ?? dims.topDiam) / 2) * scale;
  const h = dims.depth * scale;
  return {
    topLeftX: ORIGIN_X - topHalf,
    topRightX: ORIGIN_X + topHalf,
    botLeftX: ORIGIN_X - botHalf,
    botRightX: ORIGIN_X + botHalf,
    topY: TOP_Y,
    botY: TOP_Y + h,
  };
}

function esc(n) {
  return Number.isFinite(n) ? n.toFixed(0) : "–";
}

/**
 * @param {HTMLElement} container - wraps the rendered <svg>.
 * @param {object} opts
 * @param {{topDiam:number, bottomDiam:?number, depth:number}} opts.outer - decorative pot, as entered.
 * @param {{topDiam:number, bottomDiam:?number, depth:number}|null} opts.inner - computed liner, or null if not yet valid.
 * @param {number} [opts.holeCount] - drain hole count to sketch on the liner floor.
 * @param {boolean} [opts.showBottomRuler] - Full mode adds a bottom-diameter ruler.
 */
export function renderDiagram(container, opts) {
  const { outer, inner = null, holeCount = 0, showBottomRuler = false } = opts;

  if (!outer || !Number.isFinite(outer.topDiam) || !Number.isFinite(outer.depth) || outer.topDiam <= 0 || outer.depth <= 0) {
    container.innerHTML = placeholderSvg();
    return;
  }

  const maxDiam = Math.max(outer.topDiam, outer.bottomDiam || outer.topDiam);
  const scale = Math.min(AVAIL_W / maxDiam, AVAIL_H / outer.depth);

  const L = layoutTrapezoid(outer, scale);
  const I = inner ? layoutTrapezoid(inner, scale) : null;

  const parts = [];
  parts.push(
    `<svg width="230" height="260" viewBox="0 0 ${VIEW_W} ${VIEW_H}" fill="none" xmlns="http://www.w3.org/2000/svg">`
  );

  // Outer dashed trapezoid (decorative pot cavity)
  parts.push(
    `<path d="M${f(L.topLeftX)} ${f(L.topY)} H${f(L.topRightX)}" stroke="#C77A5B" stroke-width="1.5" stroke-dasharray="4 3"/>`
  );
  parts.push(
    `<path d="M${f(L.topLeftX)} ${f(L.topY)} L${f(L.botLeftX)} ${f(L.botY)} H${f(L.botRightX)} L${f(L.topRightX)} ${f(L.topY)}" stroke="#C77A5B" stroke-width="1.5" stroke-dasharray="4 3" fill="none"/>`
  );

  // Inner solid trapezoid (computed liner)
  if (I) {
    parts.push(
      `<path d="M${f(I.topLeftX)} ${f(I.topY)} L${f(I.botLeftX)} ${f(I.botY)} H${f(I.botRightX)} L${f(I.topRightX)} ${f(I.topY)} Z" stroke="#3B2A20" stroke-width="2" fill="#F8F4EA"/>`
    );
    const n = Math.min(Math.max(holeCount, 0), 7);
    if (n > 0) {
      const floorY = I.botY - 9;
      const usableW = Math.max(I.botRightX - I.botLeftX - 16, 0);
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? ORIGIN_X : I.botLeftX + 8 + (usableW * i) / (n - 1);
        parts.push(`<circle cx="${f(x)}" cy="${f(floorY)}" r="2.5" fill="#FF5A1F"/>`);
      }
    }
  }

  // Top ruler
  const rulerY = L.topY - 18;
  parts.push(`<line x1="${f(L.topLeftX)}" y1="${f(rulerY)}" x2="${f(L.topRightX)}" y2="${f(rulerY)}" stroke="#3B2A20" stroke-width="1"/>`);
  parts.push(`<line x1="${f(L.topLeftX)}" y1="${f(rulerY - 5)}" x2="${f(L.topLeftX)}" y2="${f(rulerY + 5)}" stroke="#3B2A20" stroke-width="1"/>`);
  parts.push(`<line x1="${f(L.topRightX)}" y1="${f(rulerY - 5)}" x2="${f(L.topRightX)}" y2="${f(rulerY + 5)}" stroke="#3B2A20" stroke-width="1"/>`);
  parts.push(
    `<text x="${f(ORIGIN_X)}" y="${f(rulerY - 6)}" text-anchor="middle" font-family="Courier New" font-size="9" fill="#3B2A20">Ø ${esc(outer.topDiam)} TOP</text>`
  );

  // Depth ruler
  const depthX = 14;
  parts.push(`<line x1="${depthX}" y1="${f(L.topY)}" x2="${depthX}" y2="${f(L.botY)}" stroke="#3B2A20" stroke-width="1"/>`);
  parts.push(`<line x1="${depthX - 5}" y1="${f(L.topY)}" x2="${depthX + 5}" y2="${f(L.topY)}" stroke="#3B2A20" stroke-width="1"/>`);
  parts.push(`<line x1="${depthX - 5}" y1="${f(L.botY)}" x2="${depthX + 5}" y2="${f(L.botY)}" stroke="#3B2A20" stroke-width="1"/>`);
  const midY = (L.topY + L.botY) / 2;
  parts.push(
    `<text x="${depthX - 10}" y="${f(midY)}" text-anchor="middle" font-family="Courier New" font-size="9" fill="#3B2A20" transform="rotate(-90 ${depthX - 10} ${f(midY)})">DEPTH ${esc(outer.depth)}</text>`
  );

  // Bottom ruler (Full mode)
  if (showBottomRuler && Number.isFinite(outer.bottomDiam) && outer.bottomDiam > 0) {
    const brY = L.botY + 18;
    parts.push(`<line x1="${f(L.botLeftX)}" y1="${f(brY)}" x2="${f(L.botRightX)}" y2="${f(brY)}" stroke="#3B2A20" stroke-width="1"/>`);
    parts.push(`<line x1="${f(L.botLeftX)}" y1="${f(brY - 5)}" x2="${f(L.botLeftX)}" y2="${f(brY + 5)}" stroke="#3B2A20" stroke-width="1"/>`);
    parts.push(`<line x1="${f(L.botRightX)}" y1="${f(brY - 5)}" x2="${f(L.botRightX)}" y2="${f(brY + 5)}" stroke="#3B2A20" stroke-width="1"/>`);
    parts.push(
      `<text x="${f(ORIGIN_X)}" y="${f(brY + 15)}" text-anchor="middle" font-family="Courier New" font-size="9" fill="#3B2A20">Ø BOTTOM ${esc(outer.bottomDiam)}</text>`
    );
  }

  parts.push(`</svg>`);
  container.innerHTML = parts.join("");
}

function f(n) {
  return Math.round(n * 10) / 10;
}

function placeholderSvg() {
  return `<svg width="230" height="260" viewBox="0 0 ${VIEW_W} ${VIEW_H}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M65 48 L78 205 H152 L165 48 Z" stroke="#3B2A20" stroke-width="1.5" stroke-dasharray="3 4" fill="none" opacity="0.35"/>
    <text x="115" y="235" text-anchor="middle" font-family="Courier New" font-size="9" fill="#3B2A20" opacity="0.45">enter measurements</text>
  </svg>`;
}
