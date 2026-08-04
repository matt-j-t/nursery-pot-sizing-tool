import * as calc from "./calculator.js";
import { buildPotMesh } from "./potBuilder.js";
import { writeBinarySTL, readSTL, meshStats } from "./stlIO.js";
import { analyzeDecorativePot, formatAnalysisReport } from "./stlDerive.js";
import { PotViewer } from "./viewer.js";

const $ = (id) => document.getElementById(id);

const els = {
  modeContainer: $("modeContainer"),
  modeDirect: $("modeDirect"),
  containerPanel: $("containerPanel"),
  directPanel: $("directPanel"),
  stlDrop: $("stlDrop"),
  stlFileInput: $("stlFileInput"),
  stlStatus: $("stlStatus"),
  ctd: $("ctd"), cbd: $("cbd"), cdep: $("cdep"),
  ttd: $("ttd"), th: $("th"),
  draftDeg: $("draftDeg"), wallT: $("wallT"), floorT: $("floorT"), clearance: $("clearance"),
  holes: $("holes"), holeDiam: $("holeDiam"),
  feetCount: $("feetCount"), feetHeight: $("feetHeight"), feetDiam: $("feetDiam"),
  nSeg: $("nSeg"),
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

function getMode() {
  return els.modeDirect.checked ? "direct" : "container";
}

function setMode(mode) {
  const isContainer = mode !== "direct";
  els.modeContainer.checked = isContainer;
  els.modeDirect.checked = !isContainer;
  els.containerPanel.hidden = !isContainer;
  els.directPanel.hidden = isContainer;
}

els.modeContainer.addEventListener("change", () => setMode("container"));
els.modeDirect.addEventListener("change", () => setMode("direct"));

function readAdvanced() {
  return {
    draftDeg: num(els.draftDeg, calc.DEFAULTS.draftDeg),
    wallT: num(els.wallT, calc.DEFAULTS.wallT),
    floorT: num(els.floorT, calc.DEFAULTS.floorT),
    clearanceTotal: num(els.clearance, calc.DEFAULTS.clearanceTotal),
    drainHoleCount: Math.round(num(els.holes, calc.DEFAULTS.drainHoleCount)),
    drainHoleDiam: num(els.holeDiam, calc.DEFAULTS.drainHoleDiam),
    feetCount: Math.round(num(els.feetCount, calc.DEFAULTS.feetCount)),
    feetHeight: num(els.feetHeight, calc.DEFAULTS.feetHeight),
    feetDiam: num(els.feetDiam, calc.DEFAULTS.feetDiam),
    nSeg: Math.round(num(els.nSeg, calc.DEFAULTS.nSeg)),
  };
}

// ---------------------------------------------------------------------
// STL upload -> auto-fill container fields
// ---------------------------------------------------------------------

els.stlDrop.addEventListener("click", () => els.stlFileInput.click());
els.stlDrop.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.stlDrop.classList.add("dragover");
});
els.stlDrop.addEventListener("dragleave", () => els.stlDrop.classList.remove("dragover"));
els.stlDrop.addEventListener("drop", (e) => {
  e.preventDefault();
  els.stlDrop.classList.remove("dragover");
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleStlFile(file);
});
els.stlFileInput.addEventListener("change", () => {
  const file = els.stlFileInput.files[0];
  if (file) handleStlFile(file);
});

async function handleStlFile(file) {
  els.stlStatus.hidden = false;
  els.stlStatus.textContent = `Analyzing ${file.name}…`;
  try {
    const buf = await file.arrayBuffer();
    const tris = readSTL(buf);
    const result = analyzeDecorativePot(tris);
    els.ctd.value = result.containerTopInnerDiam.toFixed(1);
    els.cbd.value = result.containerBottomInnerDiam.toFixed(1);
    els.cdep.value = result.containerInnerDepth.toFixed(1);
    let msg = `Detected from ${file.name}:\n` + formatAnalysisReport(result);
    if (result.warnings.length) {
      msg += "\n\n" + result.warnings.map((w) => `⚠ ${w}`).join("\n");
    }
    msg += "\n\nFields below are editable — adjust if these look off.";
    els.stlStatus.textContent = msg;
  } catch (err) {
    els.stlStatus.textContent = `Couldn't read that STL: ${err.message}`;
  }
}

// ---------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------

els.generateBtn.addEventListener("click", () => generate(true));
els.downloadStlBtn.addEventListener("click", downloadStl);
els.copyLinkBtn.addEventListener("click", copyLink);

async function generate(updateUrl) {
  const mode = getMode();
  const advanced = readAdvanced();
  let spec;
  try {
    if (mode === "container") {
      const ctd = num(els.ctd, NaN), cbd = num(els.cbd, NaN), cdep = num(els.cdep, NaN);
      if (!Number.isFinite(ctd) || !Number.isFinite(cbd) || !Number.isFinite(cdep)) {
        alert("Fill in the container's inner top diameter, bottom diameter, and depth (or upload an STL to auto-fill them).");
        return;
      }
      spec = calc.sizeFromContainerInner({
        containerTopInnerDiam: ctd,
        containerBottomInnerDiam: cbd,
        containerInnerDepth: cdep,
        ...advanced,
      });
    } else {
      const ttd = num(els.ttd, NaN), th = num(els.th, NaN);
      if (!Number.isFinite(ttd) || !Number.isFinite(th)) {
        alert("Fill in the pot's outer top diameter and height.");
        return;
      }
      spec = calc.sizeFromDirectTarget({ outerTopDiam: ttd, height: th, ...advanced });
    }
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

  // AR exports (GLB + USDZ) — don't block the visible report/preview on these
  setupAR(triangles).catch((err) => console.warn("AR export failed:", err));

  if (updateUrl) {
    const params = buildStateParams(mode, advanced);
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
    QRCode.toCanvas(els.qrCanvas, location.href, { width: 220, margin: 1 }, (err) => {
      if (err) console.warn("QR generation failed:", err);
    });
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
// the same pot without needing the original STL upload again)
// ---------------------------------------------------------------------

function buildStateParams(mode, advanced) {
  const p = new URLSearchParams();
  p.set("mode", mode);
  if (mode === "container") {
    p.set("ctd", els.ctd.value);
    p.set("cbd", els.cbd.value);
    p.set("cdep", els.cdep.value);
  } else {
    p.set("ttd", els.ttd.value);
    p.set("th", els.th.value);
  }
  p.set("draft", advanced.draftDeg);
  p.set("wall", advanced.wallT);
  p.set("floor", advanced.floorT);
  p.set("clr", advanced.clearanceTotal);
  p.set("holes", advanced.drainHoleCount);
  p.set("holeD", advanced.drainHoleDiam);
  p.set("feet", advanced.feetCount);
  p.set("feetH", advanced.feetHeight);
  p.set("feetD", advanced.feetDiam);
  p.set("seg", advanced.nSeg);
  return p;
}

function applyStateFromURL() {
  const p = new URLSearchParams(location.search);
  if (!p.has("mode")) return false;

  setMode(p.get("mode"));
  if (p.get("mode") === "container") {
    if (p.has("ctd")) els.ctd.value = p.get("ctd");
    if (p.has("cbd")) els.cbd.value = p.get("cbd");
    if (p.has("cdep")) els.cdep.value = p.get("cdep");
  } else {
    if (p.has("ttd")) els.ttd.value = p.get("ttd");
    if (p.has("th")) els.th.value = p.get("th");
  }
  if (p.has("draft")) els.draftDeg.value = p.get("draft");
  if (p.has("wall")) els.wallT.value = p.get("wall");
  if (p.has("floor")) els.floorT.value = p.get("floor");
  if (p.has("clr")) els.clearance.value = p.get("clr");
  if (p.has("holes")) els.holes.value = p.get("holes");
  if (p.has("holeD")) els.holeDiam.value = p.get("holeD");
  if (p.has("feet")) els.feetCount.value = p.get("feet");
  if (p.has("feetH")) els.feetHeight.value = p.get("feetH");
  if (p.has("feetD")) els.feetDiam.value = p.get("feetD");
  if (p.has("seg")) els.nSeg.value = p.get("seg");
  return true;
}

if (applyStateFromURL()) {
  generate(false).then(renderShareTarget);
}
