// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let familyData = { members: [], relationships: [], settings: { title: "Our Family Tree", subtitle: "" } };
let selectedMemberId = null;

// manual horizontal offsets per unitKey (personId or "a|b" for couples)
let unitOffsets = {}; // { [unitKey]: { dx:number } }

// drag state
let drag = {
  active: false,
  unitKey: null,
  pointerId: null,
  startClientX: 0,
  startDx: 0,
  moved: false,
  justEnded: false,
  justEndedTimer: null,
};

// render throttle (IMPORTANT for smooth drag)
let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderTree();
  });
}

// ═══════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════
const OFFSETS_KEY = "familyTree.unitOffsets.v1";

function loadOffsetsFromStorage() {
  try {
    const raw = localStorage.getItem(OFFSETS_KEY);
    unitOffsets = raw ? JSON.parse(raw) : {};
    if (!unitOffsets || typeof unitOffsets !== "object") unitOffsets = {};
  } catch {
    unitOffsets = {};
  }
}

function saveOffsetsToStorage() {
  try { localStorage.setItem(OFFSETS_KEY, JSON.stringify(unitOffsets)); } catch {}
}

// ═══════════════════════════════════════════
// UI helpers
// ═══════════════════════════════════════════
function $(id) { return document.getElementById(id); }

function showToast(msg) {
  const t = $("toast");
  t.textContent = String(msg || "");
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function formatDate(d) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" }) : "";
}

function updateTitle() {
  $("treeTitle").textContent = familyData.settings.title || "Our Family Tree";
  $("treeSubtitle").textContent =
    familyData.settings.subtitle ||
    (familyData.members.length === 0 ? 'Click "Add Person" to start building your family tree' : "");
  document.title = familyData.settings.title || "Our Family Tree";
}

// ═══════════════════════════════════════════
// MENU
// ═══════════════════════════════════════════
function toggleMenu() { $("dropdownMenu").classList.toggle("show"); }
function closeMenu() { $("dropdownMenu").classList.remove("show"); }

document.addEventListener("click", e => {
  if (!e.target.closest(".dropdown")) closeMenu();
});

// ═══════════════════════════════════════════
// LOAD / RESET
// ═══════════════════════════════════════════
async function loadFamily() {
  try {
    familyData = await api("GET", "/family");
    if (!familyData || typeof familyData !== "object") throw new Error("Invalid /family response");
    if (!Array.isArray(familyData.members)) familyData.members = [];
    if (!Array.isArray(familyData.relationships)) familyData.relationships = [];
    if (!familyData.settings) familyData.settings = { title: "Our Family Tree", subtitle: "" };

    loadOffsetsFromStorage();
    renderTree();
    updateTitle();
  } catch (e) {
    console.error(e);
    showToast("Failed to load data (check console)");
    familyData = { members: [], relationships: [], settings: { title: "Our Family Tree", subtitle: "" } };
    loadOffsetsFromStorage();
    renderTree();
    updateTitle();
  }
}

function resetLayout() {
  closeMenu();
  if (!confirm("Reset all manual left/right adjustments?")) return;
  unitOffsets = {};
  saveOffsetsToStorage();
  renderTree();
  showToast("Manual layout reset");
}

// ═══════════════════════════════════════════
// PHOTO preview
// ═══════════════════════════════════════════
function updatePhotoPreview() {
  const url = $("photoUrl").value.trim();
  const p = $("photoPreview");
  p.innerHTML = url
    ? `<img src="${resolvePhotoUrl(url)}" onerror="this.parentElement.innerHTML='<span class=\\'preview-placeholder\\'>Error</span>'">`
    : '<span class="preview-placeholder">No photo</span>';
}

// ═══════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════
function openAddMember() {
  $("generationOverride").value = "";
  $("memberModalTitle").textContent = "Add Family Member";
  ["memberId","firstName","lastName","maidenName","birthDate","deathDate","photoUrl","bio"].forEach(id => $(id).value = "");
  $("gender").value = "male";
  updatePhotoPreview();
  $("memberModal").classList.add("active");
  setTimeout(() => $("firstName").focus(), 100);
  closeMenu();
}

function closeMemberModal() { $("memberModal").classList.remove("active"); }

function openRelationshipModal() {
  if (familyData.members.length < 2) { showToast("Add at least 2 people first"); return; }

  const o = familyData.members
    .map(m => `<option value="${m.id}">${escapeHtml(m.firstName || "")} ${escapeHtml(m.lastName || "")}</option>`)
    .join("");

  $("relPerson1").innerHTML = o;
  $("relPerson2").innerHTML = o;
  if (familyData.members.length > 1) $("relPerson2").selectedIndex = 1;

  updateRelLabels();
  $("relModal").classList.add("active");
  closeMenu();
}

function closeRelModal() { $("relModal").classList.remove("active"); }

function updateRelLabels() {
  const t = $("relType").value;
  $("relPerson1Label").textContent = t === "parent-child" ? "Parent" : "Person 1";
  $("relPerson2Label").textContent = t === "parent-child" ? "Child" : "Person 2";
}

function openSettings() {
  $("settingsTitle").value = familyData.settings.title || "";
  $("settingsSubtitle").value = familyData.settings.subtitle || "";
  $("settingsModal").classList.add("active");
  closeMenu();
}
function closeSettings() { $("settingsModal").classList.remove("active"); }

// ═══════════════════════════════════════════
// CRUD (Member / Relationship / Settings / Import / Export)
// (Same logic as your single-file version)
// ═══════════════════════════════════════════
async function saveMember() {
  const genRaw = $("generationOverride").value;
  const generationOverride = genRaw === "" ? null : Number(genRaw);

  const id = $("memberId").value;
  const d = {
    firstName: $("firstName").value.trim(),
    lastName: $("lastName").value.trim(),
    maidenName: $("maidenName").value.trim(),
    gender: $("gender").value,
    birthDate: $("birthDate").value,
    deathDate: $("deathDate").value,
    photoUrl: $("photoUrl").value.trim(),
    bio: $("bio").value.trim(),
    generationOverride,
  };

  if (!d.firstName) { showToast("First name required"); return; }

  try {
    if (id) {
      await api("PUT", "/members/" + id, d);
      showToast(d.firstName + " updated");
    } else {
      await api("POST", "/members", d);
      showToast(d.firstName + " added");
    }
    closeMemberModal();
    await loadFamily();
  } catch (e) {
    console.error(e);
    showToast("Save failed (check console)");
  }
}

async function saveRelationship() {
  const p1 = $("relPerson1").value;
  const p2 = $("relPerson2").value;
  if (p1 === p2) { showToast("Select two different people"); return; }

  try {
    const r = await api("POST", "/relationships", { type: $("relType").value, person1: p1, person2: p2 });
    if (r && r.error) { showToast(r.error); return; }
    closeRelModal();
    showToast("Relationship added");
    await loadFamily();
  } catch (e) {
    console.error(e);
    showToast("Add relation failed (check console)");
  }
}

async function saveSettings() {
  const s = {
    title: $("settingsTitle").value.trim() || "Our Family Tree",
    subtitle: $("settingsSubtitle").value.trim(),
  };

  try {
    await api("PUT", "/settings", s);
    familyData.settings = s;
    updateTitle();
    closeSettings();
    showToast("Saved");
  } catch (e) {
    console.error(e);
    showToast("Save settings failed (check console)");
  }
}

function exportData() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(familyData, null, 2)], { type:"application/json" }));
  a.download = "family-tree-export.json";
  a.click();
  closeMenu();
  showToast("Exported");
}

async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!d.members || !d.relationships) throw new Error("Invalid format");
    await api("POST", "/import", d);
    showToast("Imported");
    await loadFamily();
  } catch (err) {
    console.error(err);
    showToast("Invalid file");
  }
}

// ═══════════════════════════════════════════
// DETAIL PANEL (kept same, shortened here)
// If you want, I will paste the full detail panel code too.
// ═══════════════════════════════════════════
function closeDetailPanel() { $("detailPanel").classList.remove("open"); selectedMemberId = null; }

// ═══════════════════════════════════════════
// DRAG (THROTTLED RENDER FIX)
// ═══════════════════════════════════════════
function onNodePointerDown(e, unitKey) {
  if (e.button !== undefined && e.button !== 0) return;

  drag.active = true;
  drag.unitKey = unitKey;
  drag.pointerId = e.pointerId ?? null;
  drag.startClientX = e.clientX;
  drag.startDx = (unitOffsets[unitKey]?.dx || 0);
  drag.moved = false;

  if (drag.justEndedTimer) clearTimeout(drag.justEndedTimer);
  drag.justEnded = false;

  document.body.classList.add("dragging");

  // pointer capture is OK, but not required since we listen on window
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}

  e.preventDefault();
  e.stopPropagation();
}

function onNodePointerMove(e) {
  if (!drag.active) return;
  if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return;

  const delta = e.clientX - drag.startClientX;
  if (Math.abs(delta) > 3) drag.moved = true;

  const newDx = drag.startDx + delta;

  // Increase clamp (or remove). This was too tight for wide trees.
  const CLAMP = 2000;
  const clamped = Math.max(-CLAMP, Math.min(CLAMP, newDx));

  unitOffsets[drag.unitKey] = { dx: clamped };

  // IMPORTANT: throttle render to animation frame
  requestRender();

  e.preventDefault();
}

function onNodePointerUp(e) {
  if (!drag.active) return;
  if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return;

  drag.active = false;
  document.body.classList.remove("dragging");

  if (drag.moved) {
    saveOffsetsToStorage();
    showToast("Layout adjusted (saved in browser)");
  }

  drag.justEnded = drag.moved;
  drag.justEndedTimer = setTimeout(() => { drag.justEnded = false; }, 200);

  drag.unitKey = null;
  drag.pointerId = null;
  drag.moved = false;

  e.preventDefault();
  e.stopPropagation();
}

window.addEventListener("pointermove", onNodePointerMove, { passive:false });
window.addEventListener("pointerup", onNodePointerUp, { passive:false });
window.addEventListener("pointercancel", onNodePointerUp, { passive:false });

// ═══════════════════════════════════════════
// LAYOUT ENGINE + RENDER
// Keep your existing layoutTree() and renderTree() here.
// (Paste from your current file; no logic change needed except event wiring)
// ═══════════════════════════════════════════

// constants
const CARD_W = 110;
const CARD_H = 130;
const COUPLE_GAP = 16;
const SIBLING_GAP = 40;
const GEN_GAP = 70;
const PADDING = 40;

function makeNodeHtml(m, x, y, unitKey) {
  const ini = (m.firstName?.[0] || "") + (m.lastName?.[0] || "");
  const ph = m.photoUrl
    ? `<img src="${resolvePhotoUrl(m.photoUrl)}" loading="lazy"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : "";
  const iS = `<span class="initials" ${m.photoUrl ? 'style="display:none"' : ""}>${escapeHtml(ini)}</span>`;

  const yrs = [];
  if (m.birthDate) yrs.push(new Date(m.birthDate + "T00:00:00").getFullYear());
  if (m.deathDate) yrs.push(new Date(m.deathDate + "T00:00:00").getFullYear());

  return `<div class="tree-node drag-hint"
    style="left:${x}px;top:${y}px;width:${CARD_W}px;"
    onclick="window.__showDetailWrapper('${m.id}')"
    onpointerdown="window.__onNodePointerDown(event, '${escapeHtml(unitKey)}')"
    title="Drag left/right to adjust layout">
    <div class="photo ${escapeHtml(m.gender || "")}">${ph}${iS}</div>
    <div class="name">${escapeHtml(m.firstName || "")} ${escapeHtml(m.lastName || "")}</div>
    ${m.maidenName ? `<div class="maiden">née ${escapeHtml(m.maidenName)}</div>` : ""}
    ${yrs.length ? `<div class="dates">${escapeHtml(yrs.join(" – "))}</div>` : ""}
  </div>`;
}

// expose handlers to inline html (keeps your current approach)
window.__onNodePointerDown = onNodePointerDown;
window.__showDetailWrapper = (id) => { if (!drag.justEnded) showToast("Open details: " + id); /* wire to your real showDetail */ };

function renderTree() {
  const canvas = $("treeCanvas");

  if (familyData.members.length === 0) {
    canvas.innerHTML = `
      <div class="empty-state">
        <div class="tree-icon">🌳</div>
        <h2>Start Your Family Tree</h2>
        <p>Add your first family member to begin.</p>
        <button class="btn btn-primary" onclick="openAddMember()">+ Add First Person</button>
      </div>`;
    canvas.style.width = "auto";
    canvas.style.height = "auto";
    return;
  }

  const { nodes, lines, width, height, genLabels } = layoutTree(); // keep your existing layoutTree()

  let html = `<svg id="treeSvg" width="${width}" height="${height}" style="width:${width}px;height:${height}px;">`;
  lines.forEach(l => { html += `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"/>`; });
  html += "</svg>";

  nodes.forEach(n => {
    const m = familyData.members.find(x => x.id === n.id);
    if (!m) return;
    html += makeNodeHtml(m, n.x, n.y, n.unitKey);
  });

  genLabels.forEach(gl => {
    html += `<div class="gen-label-abs" style="left:${gl.x}px;top:${gl.y}px;">${escapeHtml(gl.text)}</div>`;
  });

  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.style.position = "relative";
  canvas.innerHTML = html;
}

// TODO: paste your full layoutTree() from your file here (unchanged)

// ═══════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════
function bindUi() {
  $("headerTitle").addEventListener("click", closeDetailPanel);
  $("btnAddPerson").addEventListener("click", openAddMember);
  $("btnAddRelation").addEventListener("click", openRelationshipModal);

  $("btnMenu").addEventListener("click", toggleMenu);
  $("btnSettings").addEventListener("click", openSettings);
  $("btnExport").addEventListener("click", exportData);
  $("btnImport").addEventListener("click", () => $("importInput").click());
  $("btnLoadSample").addEventListener("click", () => showToast("Sample load: wire your function here"));
  $("btnResetLayout").addEventListener("click", resetLayout);

  $("importInput").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (f) await importData(f);
    e.target.value = "";
  });

  $("photoUrl").addEventListener("input", updatePhotoPreview);

  $("btnCloseMemberModal").addEventListener("click", closeMemberModal);
  $("btnCancelMember").addEventListener("click", closeMemberModal);
  $("btnSaveMember").addEventListener("click", saveMember);

  $("relType").addEventListener("change", updateRelLabels);
  $("btnCloseRelModal").addEventListener("click", closeRelModal);
  $("btnCancelRel").addEventListener("click", closeRelModal);
  $("btnSaveRel").addEventListener("click", saveRelationship);

  $("btnCloseSettings").addEventListener("click", closeSettings);
  $("btnCancelSettings").addEventListener("click", closeSettings);
  $("btnSaveSettings").addEventListener("click", saveSettings);

  $("btnCloseDetails").addEventListener("click", closeDetailPanel);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeMemberModal(); closeRelModal(); closeSettings(); closeDetailPanel(); closeMenu();
    }
  });

  document.querySelectorAll(".modal-overlay").forEach(el => {
    el.addEventListener("click", e => { if (e.target === el) el.classList.remove("active"); });
  });

  window.addEventListener("resize", () => { if (familyData.members.length) renderTree(); });
}

// init
bindUi();
loadFamily();