import * as calc from "./calculator.js";
import { buildPotMesh } from "./potBuilder.js";
import { writeBinarySTL, meshStats } from "./stlIO.js";
import { PotViewer } from "./viewer.js";
import { initBloomButton } from "./bloomButton.js";

const $ = (id) => document.getElementById(id);

const els = {
  topDiam: $("topDiam"), bottomDiam: $("bottomDiam"), depth: $("depth"),
  draftDeg: $("draftDeg"), wallT: $("wallT"), floorT: $("floorT"), clearance: $("clearance"),
  heightClearance: $("heightClearance"),
  holes: $("holes"), holeDiam: $("holeDiam"),
  nSeg: $("nSeg"),
  airSlotsEnabled: $("airSlotsEnabled"),
  generateBtn: $("generateBtn"),
  resultsSection: $("resultsSection"),
  reportPre: $("reportPre"),
  notesBox: $("notesBox"),
  warningsBox: $("warningsBox"),
  viewer3d: $("viewer3d"),
  modelViewer: $("modelViewer"),
  qrBox: $("qrBox"),
  qrCanvas: $("qrCanvas"),
  downloadStlBtn: $("downloadStlBtn"),
  copyLinkBtn: $("copyLinkBtn"),
  viewerPlaceholder: $("viewerPlaceholder"),
  resultChip: $("resultChip"),
  resultChipText: $("resultChipText"),
  chipStlLink: $("chipStlLink"),
  genStatus: $("genStatus"),
  inputSection: document.querySelector("main"),
};

const viewer = new PotViewer(els.viewer3d);
let lastTriangles = null;
let lastStlBlob = null;
let lastGlbUrl = null;
let lastUsdzUrl = null;

const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

function num(el, fallback) {
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
}

function getLiftNotchCount() {
  const checked = document.querySelector('input[name="liftNotchCount"]:checked');
  return checked ? Math.round(parseFloat(checked.value)) : 0;
}
function setLiftNotchCount(value) {
  const radio = document.querySelector(`input[name="liftNotchCount"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function readAdvanced() {
  return {
    draftDeg: num(els.draftDeg, calc.DEFAULTS.draftDeg),
    wallT: num(els.wallT, calc.DEFAULTS.wallT),
    floorT: num(els.floorT, calc.DEFAULTS.floorT),
    clearanceTotal: num(els.clearance, calc.DEFAULTS.clearanceTotal),
    heightClearance: num(els.heightClearance, calc.DEFAULTS.heightClearance),
    drainHoleCount: Math.round(num(els.holes, calc.DEFAULTS.drainHoleCount)),
    drainHoleDiam: num(els.holeDiam, calc.DEFAULTS.drainHoleDiam),
    nSeg: Math.round(num(els.nSeg, calc.DEFAULTS.nSeg)),
    liftNotchCount: getLiftNotchCount(),
    airSlotsEnabled: els.airSlotsEnabled.checked,
  };
}

// ---------------------------------------------------------------------
// Read the unified field set. Bottom diameter is optional — undefined/NaN
// simply means "don't know it", and calculator.js treats a missing
// containerBottomInnerDiam as "model without taper correction".
// ---------------------------------------------------------------------

function readFields() {
  const topDiam = num(els.topDiam, NaN);
  const depth = num(els.depth, NaN);
  const bottomDiamRaw = num(els.bottomDiam, NaN);
  const bottomDiam = Number.isFinite(bottomDiamRaw) ? bottomDiamRaw : null;
  return { topDiam, depth, bottomDiam };
}

// ---------------------------------------------------------------------
// Live 3D preview + generate-button validity
// ---------------------------------------------------------------------

function tryResolveSpec() {
  const { topDiam, depth, bottomDiam } = readFields();
  if (![topDiam, depth].every(Number.isFinite)) return null;
  const advanced = readAdvanced();
  try {
    return calc.sizeFromContainerInner({
      containerTopInnerDiam: topDiam,
      containerBottomInnerDiam: bottomDiam,
      containerInnerDepth: depth,
      ...advanced,
    });
  } catch (err) {
    return null;
  }
}

function updatePreview() {
  const spec = tryResolveSpec();
  if (!spec) {
    viewer.clear();
    els.viewerPlaceholder.hidden = false;
    return;
  }
  els.viewerPlaceholder.hidden = true;
  viewer.updateMesh(buildPotMesh(spec));
}

let previewTimer = null;
function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 200);
}

function updateGenerateEnabled() {
  els.generateBtn.disabled = tryResolveSpec() === null;
}

els.inputSection.addEventListener("input", () => {
  schedulePreviewUpdate();
  updateGenerateEnabled();
});
els.inputSection.addEventListener("change", () => {
  schedulePreviewUpdate();
  updateGenerateEnabled();
});

// ---------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------

initBloomButton(els.generateBtn, () => generate(true), { statusEl: els.genStatus });
els.downloadStlBtn.addEventListener("click", downloadStl);
els.chipStlLink.addEventListener("click", downloadStl);
els.copyLinkBtn.addEventListener("click", copyLink);

async function generate(updateUrl) {
  const { topDiam, depth, bottomDiam } = readFields();
  const advanced = readAdvanced();
  if (!Number.isFinite(topDiam) || !Number.isFinite(depth)) {
    alert("Fill in your decorative pot's inner top diameter and depth.");
    return;
  }

  let spec;
  try {
    spec = calc.sizeFromContainerInner({
      containerTopInnerDiam: topDiam,
      containerBottomInnerDiam: bottomDiam,
      containerInnerDepth: depth,
      ...advanced,
    });
  } catch (err) {
    alert(`Couldn't compute a pot: ${err.message}`);
    return;
  }

  els.reportPre.textContent = calc.formatReport(spec);

  if (spec.notes.length) {
    els.notesBox.hidden = false;
    els.notesBox.innerHTML = "<strong>Notes</strong><ul>" + spec.notes.map((n) => `<li>${n}</li>`).join("") + "</ul>";
  } else {
    els.notesBox.hidden = true;
  }
  if (spec.warnings.length) {
    els.warningsBox.hidden = false;
    els.warningsBox.innerHTML = "<strong>Warnings — check before printing</strong><ul>" + spec.warnings.map((w) => `<li>${w}</li>`).join("") + "</ul>";
  } else {
    els.warningsBox.hidden = true;
  }

  const triangles = buildPotMesh(spec);
  lastTriangles = triangles;
  const stats = meshStats(triangles);
  if (stats.boundaryEdges !== 0 || stats.nonmanifoldEdges !== 0) {
    console.warn("Mesh is not fully watertight", stats);
  }

  viewer.updateMesh(triangles);

  const stlBuf = writeBinarySTL(triangles);
  lastStlBlob = new Blob([stlBuf], { type: "model/stl" });

  els.resultsSection.hidden = false;

  els.resultChip.hidden = false;
  els.resultChipText.textContent =
    `Liner: Ø${spec.outerTopDiam.toFixed(0)} top · Ø${spec.outerBottomDiam.toFixed(0)} bottom · ${spec.height.toFixed(0)}mm`;

  // AR exports (GLB + USDZ) — don't block the visible report/preview on these
  setupAR(triangles).catch((err) => console.warn("AR export failed:", err));

  if (updateUrl) {
    const params = buildStateParams(advanced);
    history.replaceState(null, "", "?" + params.toString());
    renderShareTarget();
  }

  els.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function setupAR(triangles) {
  const glbBuf = await viewer.exportGLB();
  const usdzArr = await viewer.exportUSDZ();

  if (lastGlbUrl) URL.revokeObjectURL(lastGlbUrl);
  if (lastUsdzUrl) URL.revokeObjectURL(lastUsdzUrl);
  lastGlbUrl = URL.createObjectURL(new Blob([glbBuf], { type: "model/gltf-binary" }));
  lastUsdzUrl = URL.createObjectURL(new Blob([usdzArr], { type: "model/vnd.usdz+zip" }));

  els.modelViewer.src = lastGlbUrl;
  els.modelViewer.iosSrc = lastUsdzUrl;

  if (isCoarsePointer) {
    els.modelViewer.style.display = "block";
    els.qrBox.hidden = true;
  } else {
    els.modelViewer.style.display = "none";
    els.qrBox.hidden = false;
  }
}

function renderShareTarget() {
  if (!isCoarsePointer && window.QRCode) {
    els.qrCanvas.innerHTML = ""; // qrcodejs appends into the container each call
    try {
      new QRCode(els.qrCanvas, { text: location.href, width: 220, height: 220 });
    } catch (err) {
      console.warn("QR generation failed:", err);
    }
  }
}

function downloadStl() {
  if (!lastStlBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(lastStlBlob);
  a.download = "nursery_pot.stl";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    const original = els.copyLinkBtn.textContent;
    els.copyLinkBtn.textContent = "Copied!";
    setTimeout(() => (els.copyLinkBtn.textContent = original), 1500);
  } catch (err) {
    prompt("Copy this link:", location.href);
  }
}

// ---------------------------------------------------------------------
// URL state (also what the QR code encodes for the phone to reproduce
// the same pot)
// ---------------------------------------------------------------------

function buildStateParams(advanced) {
  const p = new URLSearchParams();
  p.set("td", els.topDiam.value);
  p.set("dep", els.depth.value);
  if (els.bottomDiam.value) p.set("bd", els.bottomDiam.value);
  p.set("draft", advanced.draftDeg);
  p.set("wall", advanced.wallT);
  p.set("floor", advanced.floorT);
  p.set("clr", advanced.clearanceTotal);
  p.set("hclr", advanced.heightClearance);
  p.set("holes", advanced.drainHoleCount);
  p.set("holeD", advanced.drainHoleDiam);
  p.set("seg", advanced.nSeg);
  p.set("notch", advanced.liftNotchCount);
  p.set("slots", advanced.airSlotsEnabled ? "1" : "0");
  return p;
}

function applyStateFromURL() {
  const p = new URLSearchParams(location.search);
  if (!p.has("td") && !p.has("ttd") && !p.has("ctd")) return false;

  // "td"/"dep"/"bd" are the current param names; "ttd"/"th" (Simple) and
  // "ctd"/"cbd"/"cdep" (Full) are accepted too so links shared before the
  // single-form redesign still work.
  if (p.has("td")) els.topDiam.value = p.get("td");
  else if (p.has("ttd")) els.topDiam.value = p.get("ttd");
  else if (p.has("ctd")) els.topDiam.value = p.get("ctd");

  if (p.has("dep")) els.depth.value = p.get("dep");
  else if (p.has("th")) els.depth.value = p.get("th");
  else if (p.has("cdep")) els.depth.value = p.get("cdep");

  if (p.has("bd")) els.bottomDiam.value = p.get("bd");
  else if (p.has("cbd")) els.bottomDiam.value = p.get("cbd");

  if (p.has("draft")) els.draftDeg.value = p.get("draft");
  if (p.has("wall")) els.wallT.value = p.get("wall");
  if (p.has("floor")) els.floorT.value = p.get("floor");
  if (p.has("clr")) els.clearance.value = p.get("clr");
  if (p.has("hclr")) els.heightClearance.value = p.get("hclr");
  if (p.has("holes")) els.holes.value = p.get("holes");
  if (p.has("holeD")) els.holeDiam.value = p.get("holeD");
  if (p.has("seg")) els.nSeg.value = p.get("seg");
  if (p.has("notch")) setLiftNotchCount(p.get("notch"));
  if (p.has("slots")) els.airSlotsEnabled.checked = p.get("slots") === "1";
  return true;
}

updatePreview();
updateGenerateEnabled();

if (applyStateFromURL()) {
  updatePreview();
  updateGenerateEnabled();
  generate(false).then(renderShareTarget);
}
