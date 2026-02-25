// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let familyData = { members: [], relationships: [], settings: { title: 'Our Family Tree', subtitle: '' } };
let selectedMemberId = null;

// ═══════════════════════════════════════════
//  API
// ═══════════════════════════════════════════
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch("/api" + path, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${method} /api${path} failed: ${res.status} ${res.statusText} ${txt}`.slice(0, 400));
  }
  if (res.status === 204) return null;

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    return txt ? { raw: txt } : null;
  }
  return res.json();
}

async function loadFamily() {
  try {
    familyData = await api("GET", "/family");
    if (!familyData || typeof familyData !== "object") throw new Error("Invalid /family response");
    if (!Array.isArray(familyData.members)) familyData.members = [];
    if (!Array.isArray(familyData.relationships)) familyData.relationships = [];
    if (!familyData.settings) familyData.settings = { title: "Our Family Tree", subtitle: "" };

    renderTree();
    updateTitle();
  } catch (e) {
    console.error(e);
    showToast("Failed to load data (check console)");
    familyData = { members: [], relationships: [], settings: { title: "Our Family Tree", subtitle: "" } };
    renderTree();
    updateTitle();
  }
}

function updateTitle() {
  document.getElementById('treeTitle').textContent = familyData.settings.title || 'Our Family Tree';
  document.getElementById('treeSubtitle').textContent =
    familyData.settings.subtitle ||
    (familyData.members.length === 0 ? 'Click "Add Person" to start building your family tree' : '');
  document.title = familyData.settings.title || 'Our Family Tree';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = String(msg || "");
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════════
//  DROPDOWN
// ═══════════════════════════════════════════
function toggleMenu() { document.getElementById('dropdownMenu').classList.toggle('show'); }
function closeMenu() { document.getElementById('dropdownMenu').classList.remove('show'); }

document.addEventListener('click', e => { if (!e.target.closest('.dropdown')) closeMenu(); });

// ═══════════════════════════════════════════
//  PHOTO
// ═══════════════════════════════════════════
function resolvePhotoUrl(url) { return url ? '/api/photo?url=' + encodeURIComponent(url) : ''; }

function updatePhotoPreview() {
  const url = document.getElementById('photoUrl').value.trim();
  const p = document.getElementById('photoPreview');
  p.innerHTML = url
    ? `<img src="${resolvePhotoUrl(url)}" onerror="this.parentElement.innerHTML='<span class=\\'preview-placeholder\\'>Error</span>'">`
    : '<span class="preview-placeholder">No photo</span>';
}

// ═══════════════════════════════════════════
//  MEMBER CRUD
// ═══════════════════════════════════════════
function openAddMember() {
  document.getElementById('generationOverride').value = '';
  document.getElementById('memberModalTitle').textContent = 'Add Family Member';
  ['memberId', 'firstName', 'lastName', 'maidenName', 'birthDate', 'deathDate', 'photoUrl', 'bio'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('gender').value = 'male';
  updatePhotoPreview();
  document.getElementById('memberModal').classList.add('active');
  setTimeout(() => document.getElementById('firstName').focus(), 100);
  closeMenu();
}

function openEditMember(id) {
  const m = familyData.members.find(x => x.id === id);
  if (!m) return;

  document.getElementById('generationOverride').value =
    (m.generationOverride === 0 || m.generationOverride) ? String(m.generationOverride) : '';

  document.getElementById('memberModalTitle').textContent = 'Edit ' + (m.firstName || '');
  document.getElementById('memberId').value = m.id;
  ['firstName', 'lastName', 'maidenName', 'gender', 'birthDate', 'deathDate', 'photoUrl', 'bio'].forEach(f => {
    document.getElementById(f).value = m[f] || '';
  });
  updatePhotoPreview();
  document.getElementById('memberModal').classList.add('active');
  closeMenu();
}

function closeMemberModal() { document.getElementById('memberModal').classList.remove('active'); }

async function saveMember() {
  const genRaw = document.getElementById('generationOverride').value;
  const generationOverride = genRaw === '' ? null : Number(genRaw);

  const id = document.getElementById('memberId').value;
  const d = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    maidenName: document.getElementById('maidenName').value.trim(),
    gender: document.getElementById('gender').value,
    birthDate: document.getElementById('birthDate').value,
    deathDate: document.getElementById('deathDate').value,
    photoUrl: document.getElementById('photoUrl').value.trim(),
    bio: document.getElementById('bio').value.trim(),
    generationOverride
  };

  if (!d.firstName) { showToast('First name required'); return; }

  try {
    if (id) {
      await api('PUT', '/members/' + id, d);
      showToast(d.firstName + ' updated');
    } else {
      await api('POST', '/members', d);
      showToast(d.firstName + ' added');
    }
    closeMemberModal();
    await loadFamily();
    if (id && selectedMemberId === id) showDetail(id);
  } catch (e) {
    console.error(e);
    showToast('Save failed (check console)');
  }
}

async function deleteMember(id) {
  const m = familyData.members.find(x => x.id === id);
  if (!m || !confirm(`Remove ${m.firstName || ''} ${m.lastName || ''}?`)) return;

  try {
    await api('DELETE', '/members/' + id);
    closeDetailPanel();
    showToast((m.firstName || 'Person') + ' removed');
    await loadFamily();
  } catch (e) {
    console.error(e);
    showToast('Delete failed (check console)');
  }
}

// ═══════════════════════════════════════════
//  RELATIONSHIP CRUD
// ═══════════════════════════════════════════
function openRelationshipModal() {
  if (familyData.members.length < 2) { showToast('Add at least 2 people first'); return; }

  const o = familyData.members
    .map(m => `<option value="${m.id}">${escapeHtml(m.firstName || '')} ${escapeHtml(m.lastName || '')}</option>`)
    .join('');

  document.getElementById('relPerson1').innerHTML = o;
  document.getElementById('relPerson2').innerHTML = o;
  if (familyData.members.length > 1) document.getElementById('relPerson2').selectedIndex = 1;

  updateRelLabels();
  document.getElementById('relModal').classList.add('active');
  closeMenu();
}

function updateRelLabels() {
  const t = document.getElementById('relType').value;
  document.getElementById('relPerson1Label').textContent = t === 'parent-child' ? 'Parent' : 'Person 1';
  document.getElementById('relPerson2Label').textContent = t === 'parent-child' ? 'Child' : 'Person 2';
}

function closeRelModal() { document.getElementById('relModal').classList.remove('active'); }

async function saveRelationship() {
  const p1 = document.getElementById('relPerson1').value;
  const p2 = document.getElementById('relPerson2').value;
  if (p1 === p2) { showToast('Select two different people'); return; }

  try {
    const r = await api('POST', '/relationships', {
      type: document.getElementById('relType').value,
      person1: p1,
      person2: p2
    });
    if (r && r.error) { showToast(r.error); return; }
    closeRelModal();
    showToast('Relationship added');
    await loadFamily();
  } catch (e) {
    console.error(e);
    showToast('Add relation failed (check console)');
  }
}

async function deleteRelationship(rid) {
  try {
    await api('DELETE', '/relationships/' + rid);
    showToast('Removed');
    await loadFamily();
    if (selectedMemberId) showDetail(selectedMemberId);
  } catch (e) {
    console.error(e);
    showToast('Remove relation failed (check console)');
  }
}

// ═══════════════════════════════════════════
//  SETTINGS / EXPORT / IMPORT
// ═══════════════════════════════════════════
function openSettings() {
  document.getElementById('settingsTitle').value = familyData.settings.title || '';
  document.getElementById('settingsSubtitle').value = familyData.settings.subtitle || '';
  document.getElementById('settingsModal').classList.add('active');
  closeMenu();
}

function closeSettings() { document.getElementById('settingsModal').classList.remove('active'); }

async function saveSettings() {
  const s = {
    title: document.getElementById('settingsTitle').value.trim() || 'Our Family Tree',
    subtitle: document.getElementById('settingsSubtitle').value.trim()
  };

  try {
    await api('PUT', '/settings', s);
    familyData.settings = s;
    updateTitle();
    closeSettings();
    showToast('Saved');
  } catch (e) {
    console.error(e);
    showToast('Save settings failed (check console)');
  }
}

function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(familyData, null, 2)], { type: 'application/json' }));
  a.download = 'family-tree-export.json';
  a.click();
  closeMenu();
  showToast('Exported');
}

async function importData(e) {
  const f = e.target.files[0];
  if (!f) return;

  try {
    const d = JSON.parse(await f.text());
    if (!d.members || !d.relationships) throw new Error("Invalid format");
    await api('POST', '/import', d);
    showToast('Imported');
    await loadFamily();
  } catch (err) {
    console.error(err);
    showToast('Invalid file');
  } finally {
    e.target.value = '';
    closeMenu();
  }
}

// ═══════════════════════════════════════════
//  DETAIL PANEL
// ═══════════════════════════════════════════
function showDetail(id) {
  selectedMemberId = id;
  const m = familyData.members.find(x => x.id === id);
  if (!m) return;

  const ini = (m.firstName?.[0] || '') + (m.lastName?.[0] || '');
  const ph = m.photoUrl
    ? `<img src="${resolvePhotoUrl(m.photoUrl)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const iH = `<span class="initials" ${m.photoUrl ? 'style="display:none"' : ''}>${escapeHtml(ini)}</span>`;

  const sp = familyData.relationships
    .filter(r => r.type === 'spouse' && (r.person1 === id || r.person2 === id))
    .map(r => ({ rel: r, member: familyData.members.find(x => x.id === (r.person1 === id ? r.person2 : r.person1)) }))
    .filter(x => x.member);

  const pa = familyData.relationships
    .filter(r => r.type === 'parent-child' && r.person2 === id)
    .map(r => ({ rel: r, member: familyData.members.find(x => x.id === r.person1) }))
    .filter(x => x.member);

  const ch = familyData.relationships
    .filter(r => r.type === 'parent-child' && r.person1 === id)
    .map(r => ({ rel: r, member: familyData.members.find(x => x.id === r.person2) }))
    .filter(x => x.member);

  const si = findSiblings(id);

  function relList(label, items) {
    if (!items.length) return '';
    return `<div class="detail-relations">
      <h4>${escapeHtml(label)}</h4>
      ${items.map(x => {
        const i = (x.member.firstName?.[0] || '') + (x.member.lastName?.[0] || '');
        const p = x.member.photoUrl
          ? `<img src="${resolvePhotoUrl(x.member.photoUrl)}" onerror="this.style.display='none'">`
          : `<span class="initials">${escapeHtml(i)}</span>`;
        const delBtn = x.rel.id !== 'sibling'
          ? `<button class="btn btn-sm btn-danger" style="margin-left:auto;padding:2px 6px;font-size:0.7rem"
               onclick="event.stopPropagation();deleteRelationship('${x.rel.id}')">✕</button>`
          : '';
        return `<div class="detail-rel-item" onclick="showDetail('${x.member.id}')">
          <div class="mini-photo">${p}</div>
          <span>${escapeHtml(x.member.firstName || '')} ${escapeHtml(x.member.lastName || '')}</span>
          ${delBtn}
        </div>`;
      }).join('')}
    </div>`;
  }

  const dates = [];
  if (m.birthDate) dates.push('b. ' + formatDate(m.birthDate));
  if (m.deathDate) dates.push('d. ' + formatDate(m.deathDate));

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-photo ${escapeHtml(m.gender || '')}">${ph}${iH}</div>
    <div class="detail-name">${escapeHtml(m.firstName || '')} ${escapeHtml(m.lastName || '')}</div>
    ${m.maidenName ? `<div class="detail-maiden">née ${escapeHtml(m.maidenName)}</div>` : ''}
    ${dates.length ? `<div class="detail-dates">${escapeHtml(dates.join(' — '))}</div>` : ''}
    ${m.bio ? `<div class="detail-bio">${escapeHtml(m.bio)}</div>` : ''}
    ${relList('Spouse / Partner', sp)}
    ${relList('Parents', pa)}
    ${relList('Children', ch)}
    ${relList('Siblings', si)}
    <div class="detail-actions">
      <button class="btn" onclick="openEditMember('${m.id}')">✏️ Edit</button>
      <button class="btn btn-danger" onclick="deleteMember('${m.id}')">🗑 Delete</button>
    </div>
  `;
  document.getElementById('detailPanel').classList.add('open');
}

function closeDetailPanel() {
  document.getElementById('detailPanel').classList.remove('open');
  selectedMemberId = null;
}

function findSiblings(id) {
  const pids = familyData.relationships
    .filter(r => r.type === 'parent-child' && r.person2 === id)
    .map(r => r.person1);

  if (!pids.length) return [];

  const s = new Set();
  pids.forEach(pid => {
    familyData.relationships
      .filter(r => r.type === 'parent-child' && r.person1 === pid && r.person2 !== id)
      .forEach(r => s.add(r.person2));
  });

  return [...s]
    .map(sid => ({ rel: { id: 'sibling' }, member: familyData.members.find(x => x.id === sid) }))
    .filter(x => x.member);
}

function formatDate(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", "&#39;");
}

// ═══════════════════════════════════════════
//  TREE LAYOUT ENGINE
// ═══════════════════════════════════════════
const CARD_W = 110;
const CARD_H = 130;
const COUPLE_GAP = 16;
const SIBLING_GAP = 40;
const GEN_GAP = 70;
const PADDING = 40;

function renderTree() {
  const canvas = document.getElementById('treeCanvas');

  if (familyData.members.length === 0) {
    canvas.innerHTML = `
      <div class="empty-state">
        <div class="tree-icon">🌳</div>
        <h2>Start Your Family Tree</h2>
        <p>Add your first family member to begin.</p>
        <button class="btn btn-primary" onclick="openAddMember()">+ Add First Person</button>
      </div>`;
    canvas.style.width = 'auto';
    canvas.style.height = 'auto';
    return;
  }

  const { nodes, lines, width, height, genLabels } = layoutTree();

  let html = `<svg id="treeSvg" width="${width}" height="${height}" style="width:${width}px;height:${height}px;">`;
  lines.forEach(l => { html += `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"/>`; });
  html += '</svg>';

  nodes.forEach(n => {
    const m = familyData.members.find(x => x.id === n.id);
    if (!m) return;
    html += makeNodeHtml(m, n.x, n.y);
  });

  genLabels.forEach(gl => {
    html += `<div class="gen-label-abs" style="left:${gl.x}px;top:${gl.y}px;">${escapeHtml(gl.text)}</div>`;
  });

  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.style.position = 'relative';
  canvas.innerHTML = html;
}

function makeNodeHtml(m, x, y) {
  const ini = (m.firstName?.[0] || '') + (m.lastName?.[0] || '');
  const ph = m.photoUrl
    ? `<img src="${resolvePhotoUrl(m.photoUrl)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const iS = `<span class="initials" ${m.photoUrl ? 'style="display:none"' : ''}>${escapeHtml(ini)}</span>`;

  const yrs = [];
  if (m.birthDate) yrs.push(new Date(m.birthDate + 'T00:00:00').getFullYear());
  if (m.deathDate) yrs.push(new Date(m.deathDate + 'T00:00:00').getFullYear());

  return `<div class="tree-node" style="left:${x}px;top:${y}px;width:${CARD_W}px;" onclick="showDetail('${m.id}')">
    <div class="photo ${escapeHtml(m.gender || '')}">${ph}${iS}</div>
    <div class="name">${escapeHtml(m.firstName || '')} ${escapeHtml(m.lastName || '')}</div>
    ${m.maidenName ? `<div class="maiden">née ${escapeHtml(m.maidenName)}</div>` : ''}
    ${yrs.length ? `<div class="dates">${escapeHtml(yrs.join(' – '))}</div>` : ''}
  </div>`;
}

function layoutTree() {
  const rels = familyData.relationships;
  const members = familyData.members;
  const pcRels = rels.filter(r => r.type === 'parent-child');
  const spRels = rels.filter(r => r.type === 'spouse');

  // ─────────────────────────────────────────
  // GENERATION assignment (with overrides)
  // ─────────────────────────────────────────
  const depth = {};
  members.forEach(m => depth[m.id] = 0);

  const anchor = {};
  members.forEach(m => {
    if (m.generationOverride === 0 || m.generationOverride) {
      const v = Number(m.generationOverride);
      if (!Number.isNaN(v) && v >= 0) anchor[m.id] = v;
    }
  });

  const spouseAdj = {};
  spRels.forEach(r => {
    (spouseAdj[r.person1] = spouseAdj[r.person1] || []).push(r.person2);
    (spouseAdj[r.person2] = spouseAdj[r.person2] || []).push(r.person1);
  });

  const visited = new Set();
  Object.keys(anchor).forEach(startId => {
    if (visited.has(startId)) return;
    const q = [startId];
    const component = [];
    visited.add(startId);

    while (q.length) {
      const cur = q.shift();
      component.push(cur);
      (spouseAdj[cur] || []).forEach(nxt => {
        if (!visited.has(nxt)) { visited.add(nxt); q.push(nxt); }
      });
    }

    const anchored = component.map(id => anchor[id]).filter(v => v !== undefined);
    const compAnchor = anchored.length ? Math.max(...anchored) : undefined;
    if (compAnchor !== undefined) component.forEach(id => { anchor[id] = compAnchor; });
  });

  Object.keys(anchor).forEach(id => { depth[id] = Math.max(depth[id], anchor[id]); });

  const MAX_ITERS = members.length * 8;
  for (let i = 0; i < MAX_ITERS; i++) {
    let changed = false;

    spRels.forEach(r => {
      const a = r.person1, b = r.person2;
      const mx = Math.max(depth[a] ?? 0, depth[b] ?? 0);
      if (depth[a] !== mx) { depth[a] = mx; changed = true; }
      if (depth[b] !== mx) { depth[b] = mx; changed = true; }
    });

    Object.entries(anchor).forEach(([id, ad]) => {
      if ((depth[id] ?? 0) < ad) { depth[id] = ad; changed = true; }
    });

    pcRels.forEach(r => {
      const p = r.person1, c = r.person2;
      const want = (depth[p] ?? 0) + 1;
      if ((depth[c] ?? 0) < want) { depth[c] = want; changed = true; }
    });

    if (!changed) break;
  }

  const minD = Math.min(...Object.values(depth));
  Object.keys(depth).forEach(id => depth[id] -= minD);
  const maxD = Math.max(...Object.values(depth));

  // spousesOf + childrenOf
  const spousesOf = {};
  spRels.forEach(r => {
    (spousesOf[r.person1] = spousesOf[r.person1] || []).push(r.person2);
    (spousesOf[r.person2] = spousesOf[r.person2] || []).push(r.person1);
  });

  const childrenOf = {};
  pcRels.forEach(r => { (childrenOf[r.person1] = childrenOf[r.person1] || []).push(r.person2); });

  // ─────────────────────────────────────────
  // BUILD COUPLE/SINGLE UNITS PER GENERATION
  // Female always on RIGHT
  // ─────────────────────────────────────────
  const personToUnitKey = {};
  const unitKeyToMembers = {};
  const used = new Set();

  for (let d = 0; d <= maxD; d++) {
    const gm = members.filter(m => depth[m.id] === d);

    gm.forEach(m => {
      if (used.has(m.id)) return;

      const spouseId = (spousesOf[m.id] || []).find(sid => !used.has(sid) && depth[sid] === d);

      if (spouseId) {
        const m1 = members.find(x => x.id === m.id);
        const m2 = members.find(x => x.id === spouseId);

        let leftId, rightId;
        if (m1?.gender === 'male' && m2?.gender === 'female') {
          leftId = m1.id; rightId = m2.id;
        } else if (m1?.gender === 'female' && m2?.gender === 'male') {
          leftId = m2.id; rightId = m1.id;
        } else {
          [leftId, rightId] = [m.id, spouseId].sort();
        }

        const key = `${leftId}|${rightId}`;
        used.add(leftId); used.add(rightId);
        unitKeyToMembers[key] = [leftId, rightId];
        personToUnitKey[leftId] = key;
        personToUnitKey[rightId] = key;
      } else {
        const key = m.id;
        used.add(m.id);
        unitKeyToMembers[key] = [m.id];
        personToUnitKey[m.id] = key;
      }
    });
  }

  const unitsByGen = Array.from({ length: maxD + 1 }, () => []);
  Object.entries(unitKeyToMembers).forEach(([key, ids]) => {
    const d = depth[ids[0]] ?? 0;
    unitsByGen[d].push(key);
  });

  // Build unit graph for ordering
  const unitChildren = {};
  const unitParents = {};
  Object.keys(unitKeyToMembers).forEach(k => { unitChildren[k] = new Set(); unitParents[k] = new Set(); });

  pcRels.forEach(r => {
    const pu = personToUnitKey[r.person1];
    const cu = personToUnitKey[r.person2];
    if (!pu || !cu || pu === cu) return;
    unitChildren[pu].add(cu);
    unitParents[cu].add(pu);
  });

  const orderedUnitsByGen = Array.from({ length: maxD + 1 }, () => []);

  const rootUnits = unitsByGen[0]
    .filter(u => unitParents[u].size === 0)
    .sort((u1, u2) => {
      const a1 = unitKeyToMembers[u1][0], a2 = unitKeyToMembers[u2][0];
      const m1 = members.find(x => x.id === a1), m2 = members.find(x => x.id === a2);
      const s1 = `${m1?.lastName || ''} ${m1?.firstName || ''}`.toLowerCase();
      const s2 = `${m2?.lastName || ''} ${m2?.firstName || ''}`.toLowerCase();
      return s1.localeCompare(s2);
    });

  const seenUnit = new Set();
  rootUnits.forEach(u => { orderedUnitsByGen[0].push(u); seenUnit.add(u); });
  unitsByGen[0].forEach(u => { if (!seenUnit.has(u)) { orderedUnitsByGen[0].push(u); seenUnit.add(u); } });

  for (let d = 0; d < maxD; d++) {
    unitsByGen[d].forEach(u => { if (!orderedUnitsByGen[d].includes(u)) orderedUnitsByGen[d].push(u); });

    const next = [];
    orderedUnitsByGen[d].forEach(u => {
      [...unitChildren[u]].forEach(cu => {
        if ((depth[unitKeyToMembers[cu][0]] ?? 0) === d + 1 && !next.includes(cu)) next.push(cu);
      });
    });
    unitsByGen[d + 1].forEach(u => { if (!next.includes(u)) next.push(u); });
    orderedUnitsByGen[d + 1] = next;
  }

  const gens = [];
  for (let d = 0; d <= maxD; d++) {
    const orderedKeys = orderedUnitsByGen[d].length ? orderedUnitsByGen[d] : unitsByGen[d];
    const units = orderedKeys
      .filter(k => (unitKeyToMembers[k] || []).length)
      .map(k => unitKeyToMembers[k].map(id => members.find(m => m.id === id)).filter(Boolean));
    if (units.length) gens.push({ depth: d, units });
  }

  // ── Positions ──
  const nodes = [];
  const lines = [];
  const unitPositions = {};

  let totalW = 0;
  gens.forEach(gen => {
    let genW = 0;
    gen.units.forEach(unit => {
      genW += (unit.length === 2 ? 2 * CARD_W + COUPLE_GAP : CARD_W) + SIBLING_GAP;
    });
    genW -= SIBLING_GAP;
    totalW = Math.max(totalW, genW);
  });

  const canvasW = totalW + PADDING * 2;

  gens.forEach((gen, gi) => {
    const y = PADDING + gi * (CARD_H + GEN_GAP);

    let genW = 0;
    gen.units.forEach(unit => { genW += (unit.length === 2 ? 2 * CARD_W + COUPLE_GAP : CARD_W) + SIBLING_GAP; });
    genW -= SIBLING_GAP;

    let x = (canvasW - genW) / 2;

    gen.units.forEach((unit, ui) => {
      const unitW = unit.length === 2 ? 2 * CARD_W + COUPLE_GAP : CARD_W;
      const cx = x + unitW / 2;

      if (unit.length === 2) {
        const x1 = x, x2 = x + CARD_W + COUPLE_GAP;
        nodes.push({ id: unit[0].id, x: x1, y });
        nodes.push({ id: unit[1].id, x: x2, y });

        // spouse line
        const lineY = y + 38;
        lines.push({ x1: x1 + CARD_W / 2, y1: lineY, x2: x2 + CARD_W / 2, y2: lineY });

        unitPositions[`${gi}-${ui}`] = { cx, cy: y, memberIds: [unit[0].id, unit[1].id] };
      } else {
        nodes.push({ id: unit[0].id, x, y });
        unitPositions[`${gi}-${ui}`] = { cx: x + CARD_W / 2, cy: y, memberIds: [unit[0].id] };
      }

      x += unitW + SIBLING_GAP;
    });
  });

  // ── Parent-child lines ── (lane-based midY to reduce crossings)
  const LANE_GAP = 10;
  gens.forEach((gen, gi) => {
    gen.units.forEach((unit, ui) => {
      const parentIds = unit.map(m => m.id);
      const allChildIds = new Set();
      parentIds.forEach(pid => (childrenOf[pid] || []).forEach(cid => allChildIds.add(cid)));
      if (!allChildIds.size) return;

      const parentPos = unitPositions[`${gi}-${ui}`];
      if (!parentPos) return;

      const parentBottomY = parentPos.cy + CARD_H - 20;
      const parentCx = parentPos.cx;

      const childNodes = [...allChildIds].map(cid => nodes.find(n => n.id === cid)).filter(Boolean);
      if (!childNodes.length) return;

      const childTopY = Math.min(...childNodes.map(n => n.y));
      const midBase = parentBottomY + (childTopY - parentBottomY) / 2;
      const lane = ui % 6; // 0..5
      const midY = midBase + lane * LANE_GAP;

      lines.push({ x1: parentCx, y1: parentBottomY, x2: parentCx, y2: midY });

      const childCxs = childNodes.map(n => n.x + CARD_W / 2).sort((a, b) => a - b);

      if (childCxs.length === 1) {
        lines.push({ x1: parentCx, y1: midY, x2: childCxs[0], y2: midY });
        lines.push({ x1: childCxs[0], y1: midY, x2: childCxs[0], y2: childTopY });
      } else {
        const minCx = childCxs[0];
        const maxCx = childCxs[childCxs.length - 1];
        lines.push({ x1: minCx, y1: midY, x2: maxCx, y2: midY });

        const joinX = Math.min(Math.max(parentCx, minCx), maxCx);
        lines.push({ x1: parentCx, y1: midY, x2: joinX, y2: midY });

        childCxs.forEach(cx => lines.push({ x1: cx, y1: midY, x2: cx, y2: childTopY }));
      }
    });
  });

  // ── Generation labels ──
  const genLabels = [];
  const n = gens.length;
  gens.forEach((gen, gi) => {
    const fromBottom = n - 1 - gi;
    let label = '';
    if (n > 1) {
      if (fromBottom === 0) label = 'Children';
      else if (fromBottom === 1) label = 'Parents';
      else if (fromBottom === 2) label = 'Grandparents';
      else label = 'Great-'.repeat(fromBottom - 2) + 'Grandparents';
    }
    if (label) {
      const y = PADDING + gi * (CARD_H + GEN_GAP) - 16;
      genLabels.push({ text: label, x: canvasW / 2 - label.length * 3.5, y });
    }
  });

  const totalH = PADDING * 2 + gens.length * CARD_H + (gens.length - 1) * GEN_GAP;
  return { nodes, lines, width: canvasW, height: totalH, genLabels };
}

// ═══════════════════════════════════════════
//  SAMPLE DATA
// ═══════════════════════════════════════════
async function loadSampleData() {
  closeMenu();
  if (familyData.members.length > 0 && !confirm('Replace current tree with sample data?')) return;

  const s = {
    settings: { title: 'Our Family Tree', subtitle: 'The Anderson & Brown Family' },
    members: [
      { id: 'gf1', firstName: 'Betty', lastName: 'Brown', gender: 'female', birthDate: '1945-03-12', photoUrl: '', bio: 'Matriarch' },
      { id: 'gm1', firstName: 'Ron', lastName: 'Anderson', gender: 'male', birthDate: '1943-07-20', photoUrl: '', bio: 'Patriarch' },
      { id: 'p2', firstName: 'Jace', lastName: 'Anderson', gender: 'male', birthDate: '1970-02-14', photoUrl: '' },
      { id: 'p3', firstName: 'Alyssa', lastName: 'Anderson', maidenName: 'Lewis', gender: 'female', birthDate: '1972-09-30' },
      { id: 'p4', firstName: 'Aaron', lastName: 'Lewis', gender: 'male', birthDate: '1940-01-18', deathDate: '2015-12-01' },
      { id: 'c1', firstName: 'Jessie', lastName: 'Anderson', gender: 'female', birthDate: '1995-06-22' },
      { id: 'c2', firstName: 'Evan', lastName: 'Anderson', gender: 'male', birthDate: '1997-03-10' }
    ],
    relationships: [
      { id: 'r1', type: 'spouse', person1: 'gf1', person2: 'gm1' },
      { id: 'r3', type: 'parent-child', person1: 'gf1', person2: 'p2' }, { id: 'r4', type: 'parent-child', person1: 'gm1', person2: 'p2' },
      { id: 'r5', type: 'parent-child', person1: 'gm1', person2: 'p3' }, { id: 'r6', type: 'parent-child', person1: 'gf1', person2: 'p3' },
      { id: 'r7', type: 'spouse', person1: 'p3', person2: 'p4' },
      { id: 'r8', type: 'parent-child', person1: 'p2', person2: 'c1' },
      { id: 'r9', type: 'parent-child', person1: 'p2', person2: 'c2' }
    ]
  };

  try {
    await api('POST', '/import', s);
    showToast('Sample loaded');
    await loadFamily();
  } catch (e) {
    console.error(e);
    showToast('Sample load failed (check console)');
  }
}

// ═══════════════════════════════════════════
//  UI WIRING
// ═══════════════════════════════════════════
function wireUI() {
  document.getElementById('homeTitle').addEventListener('click', closeDetailPanel);
  document.getElementById('btnAddPerson').addEventListener('click', openAddMember);
  document.getElementById('btnAddRelation').addEventListener('click', openRelationshipModal);
  document.getElementById('btnMenu').addEventListener('click', toggleMenu);
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('btnExport').addEventListener('click', exportData);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importInput').click());
  document.getElementById('btnSample').addEventListener('click', loadSampleData);

  document.getElementById('importInput').addEventListener('change', importData);

  document.getElementById('btnCloseDetails').addEventListener('click', closeDetailPanel);

  document.getElementById('btnCloseMember').addEventListener('click', closeMemberModal);
  document.getElementById('btnCancelMember').addEventListener('click', closeMemberModal);
  document.getElementById('btnSaveMember').addEventListener('click', saveMember);

  document.getElementById('photoUrl').addEventListener('input', updatePhotoPreview);

  document.getElementById('btnCloseRel').addEventListener('click', closeRelModal);
  document.getElementById('btnCancelRel').addEventListener('click', closeRelModal);
  document.getElementById('btnSaveRel').addEventListener('click', saveRelationship);
  document.getElementById('relType').addEventListener('change', updateRelLabels);

  document.getElementById('btnCloseSettings').addEventListener('click', closeSettings);
  document.getElementById('btnCancelSettings').addEventListener('click', closeSettings);
  document.getElementById('btnSaveSettings').addEventListener('click', saveSettings);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeMemberModal();
      closeRelModal();
      closeSettings();
      closeDetailPanel();
      closeMenu();
    }
  });

  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
  });

  window.addEventListener('resize', () => { if (familyData.members.length) renderTree(); });
}

wireUI();
loadFamily();