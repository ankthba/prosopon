import { FaceLandmarker, FilesetResolver } from '../vendor/tasks-vision/vision_bundle.mjs';
import { buildPoints, FACE_OVAL_ORDERED } from './landmarks.js';
import { computeFrontal, qualityCheck } from './metrics-front.js';
import { analyseSkin, itaClass } from './skin.js';
import { renderOverlay, LAYERS, DRAWERS } from './render.js';
import { buildRows, buildProfileRows, summarise, byMutability, fmtValue, PROFILE_LABELS } from './report.js';
import { PROFILE_POINTS, computeProfile, profileQuality } from './metrics-profile.js';
import { NORMS, PROFILE_NORMS, refFor, MUTABILITY } from './norms.js';
import { METHOD_HTML } from './method.js';
import { dist } from './geom.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let landmarker = null;
const S = {
  sex: '',
  front: { img: null, ctx: null, res: null, skin: null, issues: [], R: null, trichionY: null, matrix: null,
    layers: { outline: true, midline: false, thirds: false, fifths: false, mesh: false, symmetry: false, skin: false },
    highlight: null },
  profile: { img: null, pts: {}, next: 0, res: null },
};

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

async function getLandmarker() {
  if (landmarker) return landmarker;
  toast('Loading the face model (one time, ~15MB)…', 8000);
  const fs = await FilesetResolver.forVisionTasks('./vendor/tasks-vision/wasm');
  landmarker = await FaceLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: './models/face_landmarker.task', delegate: 'GPU' },
    runningMode: 'IMAGE', numFaces: 1,
    outputFaceBlendshapes: false, outputFacialTransformationMatrixes: true,
  });
  $('#toast').hidden = true;
  return landmarker;
}

// ============================ MODES ============================
$$('.mode').forEach((b) => b.addEventListener('click', () => {
  $$('.mode').forEach((x) => x.classList.toggle('is-on', x === b));
  const m = b.dataset.mode;
  $('#pane-front').hidden = m !== 'front';
  $('#pane-profile').hidden = m !== 'profile';
  $('#pane-method').hidden = m !== 'method';
}));

$('#sex').addEventListener('change', (e) => {
  S.sex = e.target.value;
  if (S.front.res) drawReport();
  if (S.profile.res) computeAndDrawProfile();
});

$('#method').innerHTML = METHOD_HTML;

// ============================ FILE INPUT ============================
function wireDrop(zone, onFile) {
  ['dragenter', 'dragover'].forEach((e) => zone.addEventListener(e, (ev) => {
    ev.preventDefault(); zone.classList.add('hot');
  }));
  ['dragleave', 'drop'].forEach((e) => zone.addEventListener(e, (ev) => {
    ev.preventDefault(); zone.classList.remove('hot');
  }));
  zone.addEventListener('drop', (ev) => {
    const f = ev.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) onFile(f);
  });
}
const readImage = (file) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img); img.onerror = rej;
  img.src = URL.createObjectURL(file);
});

wireDrop($('#drop'), loadFrontal);
$('#pick').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => e.target.files[0] && loadFrontal(e.target.files[0]));
const SAMPLE = './testdata/Official_portrait_of_Barack_Obama.jpg';
$('#sample').addEventListener('click', () => loadFrontalFromSrc(SAMPLE));
// The sample portraits are not shipped with the repo, so only offer the button
// if one is actually present.
fetch(SAMPLE, { method: 'HEAD' })
  .then((r) => { if (!r.ok) $('#sample').hidden = true; })
  .catch(() => { $('#sample').hidden = true; });
$('#reset').addEventListener('click', () => {
  $('#viewer').hidden = true; $('#drop').hidden = false;
  $('#report').innerHTML = '<div class="empty">Load a photo to begin.</div>';
  $('#export').disabled = true;
});

wireDrop($('#pdrop'), loadProfile);
$('#ppick').addEventListener('click', () => $('#pfile').click());
$('#pfile').addEventListener('change', (e) => e.target.files[0] && loadProfile(e.target.files[0]));
$('#preset').addEventListener('click', () => {
  $('#pviewer').hidden = true; $('#pdrop').hidden = false;
  S.profile = { img: null, pts: {}, next: 0, res: null };
  $('#preport').innerHTML = '<div class="empty">Load a profile photo to begin.</div>';
});
$('#pundo').addEventListener('click', undoProfilePoint);

// ============================ FRONTAL ============================
async function loadFrontal(file) { loadFrontalFromSrc(await readImage(file).then((i) => i.src)); }

async function loadFrontalFromSrc(src) {
  const img = $('#photo');
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  $('#drop').hidden = true; $('#viewer').hidden = false;
  S.front.img = img; S.front.trichionY = null;
  await analyseFrontal();
}

async function analyseFrontal() {
  const img = S.front.img;
  const lm = await getLandmarker();
  const out = lm.detect(img);
  if (!out.faceLandmarks?.length) {
    $('#report').innerHTML = '<div class="note fail"><b>No face found</b>Try a photo where the whole face is visible, reasonably lit and not heavily cropped.</div>';
    return;
  }
  const ctx = buildPoints(out.faceLandmarks[0], img.naturalWidth, img.naturalHeight);
  const matrix = out.facialTransformationMatrixes?.[0]?.data ?? null;
  S.front.ctx = ctx; S.front.matrix = matrix;
  recompute();
  S.front.skin = analyseSkin(ctx, img);
  $('#export').disabled = false;
  drawReport();
  layoutCanvas();
  positionTrichionHandle();
}

function recompute() {
  const { ctx, matrix, trichionY } = S.front;
  S.front.res = computeFrontal(ctx, { sex: S.sex || null, matrix, trichionY });
  S.front.issues = qualityCheck(S.front.res, ctx);
}

function buildR() {
  const { ctx, res, skin } = S.front;
  const A = res.aligned;
  const oval = FACE_OVAL_ORDERED.map((i) => A.P[i]);
  const xs = oval.map((p) => p.x), ys = oval.map((p) => p.y);
  return {
    ctx, res, skin, A,
    u: dist(A.named.R_pupil, A.named.L_pupil),
    bounds: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) },
    rotO: A.origin, rotTheta: A.theta,
  };
}

function layoutCanvas() {
  const img = $('#photo'), cv = $('#overlay');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  S.front.R = buildR();
  renderOverlay(cv, S.front.R, { layers: S.front.layers, highlight: S.front.highlight });
  const sc = S.front.res.scale;
  $('#scalehint').textContent = Number.isFinite(sc.mmPerPx)
    ? `Scale: iris ${sc.irisPx.toFixed(1)}px = 11.7mm → ${sc.mmPerPx.toFixed(3)} mm/px`
    : 'No millimetre scale — ratios only';
  drawLayerChips();
}

function drawLayerChips() {
  const host = $('#layers');
  if (host.dataset.built) return;
  host.dataset.built = '1';
  host.innerHTML = Object.entries(LAYERS).map(([id, l]) =>
    `<label class="chip${S.front.layers[id] ? ' on' : ''}" data-layer="${id}"><input type="checkbox" ${S.front.layers[id] ? 'checked' : ''}>${esc(l.label)}</label>`).join('');
  host.addEventListener('click', (e) => {
    const lab = e.target.closest('.chip'); if (!lab) return;
    e.preventDefault();
    const id = lab.dataset.layer;
    S.front.layers[id] = !S.front.layers[id];
    lab.classList.toggle('on', S.front.layers[id]);
    lab.querySelector('input').checked = S.front.layers[id];
    renderOverlay($('#overlay'), S.front.R, { layers: S.front.layers, highlight: S.front.highlight });
  });
}

// ---- trichion handle ----
function positionTrichionHandle() {
  const h = $('#trichionHandle'), img = $('#photo'), res = S.front.res;
  if (!res) return;
  const raw = res.aligned.unrotate(res.trichion);
  h.style.left = `${(raw.x / img.naturalWidth) * 100}%`;
  h.style.top = `${(raw.y / img.naturalHeight) * 100}%`;
  h.hidden = false;
}
(() => {
  const h = $('#trichionHandle');
  let drag = false;
  h.addEventListener('pointerdown', (e) => { drag = true; h.setPointerCapture(e.pointerId); });
  h.addEventListener('pointermove', (e) => {
    if (!drag || !S.front.res) return;
    const wrap = $('#cwrap').getBoundingClientRect();
    const img = $('#photo');
    const yRaw = ((e.clientY - wrap.top) / wrap.height) * img.naturalHeight;
    // convert raw y into the aligned frame
    const A = S.front.res.aligned;
    const c = Math.cos(A.theta), s = Math.sin(A.theta);
    const dx = 0, dy = yRaw - A.origin.y;
    S.front.trichionY = A.origin.y + dx * s + dy * c;
    recompute(); layoutCanvas(); positionTrichionHandle(); drawReport();
  });
  h.addEventListener('pointerup', () => { drag = false; });
})();

// ============================ REPORT ============================
function statusWord(s) {
  return { typical: 'typical', slight: 'slightly outside', notable: 'well outside', unscored: 'not scored', unknown: '—' }[s] || s;
}

function bar(item) {
  const entry = NORMS[item.id] || PROFILE_NORMS[item.id];
  const ref = refFor(entry, S.sex || null);
  if (!ref) return '';
  let lo, hi, glo, ghi;
  if (ref.kind === 'nm') { lo = ref.mean - ref.sd; hi = ref.mean + ref.sd; glo = ref.mean - 3 * ref.sd; ghi = ref.mean + 3 * ref.sd; }
  else { const pad = (ref.hi - ref.lo) * 1.4; lo = ref.lo; hi = ref.hi; glo = ref.lo - pad; ghi = ref.hi + pad; }
  const pct = (v) => Math.max(0, Math.min(100, ((v - glo) / ((ghi - glo) || 1)) * 100));
  return `<div class="bar"><i style="left:${pct(lo)}%;width:${Math.max(1, pct(hi) - pct(lo))}%"></i><u style="left:calc(${pct(item.value)}% - 1px)"></u></div>
    <div class="barlab"><span>${fmtValue(item.id, glo, item.unit)}</span><span>${ref.kind === 'nm' ? 'shaded = ±1 SD' : 'shaded = target range'}</span><span>${fmtValue(item.id, ghi, item.unit)}</span></div>`;
}

function sidesLine(item) {
  const d = item.detail;
  if (!d || typeof d !== 'object') return '';
  if ('right' in d && 'left' in d && Number.isFinite(d.right)) {
    const diff = Math.abs(d.right - d.left);
    return `<div class="sides"><span>Right ${fmtValue(item.id, d.right, item.unit)}</span><span>Left ${fmtValue(item.id, d.left, item.unit)}</span><span>Δ ${fmtValue(item.id, diff, item.unit)}</span></div>`;
  }
  if ('upperPct' in d) {
    return `<div class="sides"><span>Upper ${d.upperPct.toFixed(1)}%</span><span>Middle ${d.middlePct.toFixed(1)}%</span><span>Lower ${d.lowerPct.toFixed(1)}%</span></div>`;
  }
  if ('upperMm' in d) {
    return `<div class="sides"><span>Upper lip ${d.upperMm.toFixed(1)}mm</span><span>Lower lip ${d.lowerMm.toFixed(1)}mm</span></div>`;
  }
  if ('Eyes' in d) {
    return `<div class="sides">${Object.entries(d).map(([k, v]) => `<span>${k} ${v.rms.toFixed(2)}mm</span>`).join('')}</div>`;
  }
  return '';
}

function rowHtml(item) {
  const entry = NORMS[item.id] || PROFILE_NORMS[item.id];
  // An SD figure only means something against a distribution. A target range
  // has no SD, so quoting one there would be inventing precision.
  const kind = refFor(entry, S.sex || null)?.kind;
  const showZ = kind === 'nm' && Number.isFinite(item.z)
    && item.status !== 'unscored' && !item.ancestrySensitive;
  const z = showZ ? `${item.z >= 0 ? '+' : ''}${item.z.toFixed(1)}\u2009SD` : '';
  return `
  <div class="row s-${item.status}" data-metric="${item.id}">
    <div class="rlabel"><span class="dot"></span>${esc(item.label)}</div>
    <div class="rval">${esc(item.display)}</div>
    <div class="rref">${esc(item.refText)}${z ? ` &middot; ${z}` : ''}</div>
  </div>
  <div class="detail" data-detail="${item.id}" hidden>
    ${item.provisional ? '<p><b>Waiting on the hairline.</b> Drag the marker on the photo up to your own hairline, then this is scored.</p>' : ''}
    ${item.direction ? `<p><b>Reads as</b> ${esc(item.direction)}.</p>` : ''}
    <p>${esc(item.text)}</p>
    ${item.status === 'unscored' ? '' : bar(item)}
    ${sidesLine(item)}
    <div class="meta">
      <span class="badge t-${item.tier}">${esc(item.tierLabel)}</span>
      <span class="badge">${esc(item.mutabilityInfo.label)}</span>
      ${item.ancestrySensitive ? '<span class="badge">Ancestry-sensitive</span>' : ''}
      ${item.status === 'unscored' ? '' : `<span class="badge">${statusWord(item.status)}</span>`}
    </div>
    <p class="srcline">${esc(item.mutabilityInfo.hint)}<br>Source: ${esc(item.source)}</p>
  </div>`;
}

function drawReport() {
  recompute();
  const res = S.front.res;
  const rows = buildRows(res, S.sex || null);
  const sum = summarise(rows);
  const host = $('#report');

  const NOTE_TITLE = { fail: 'Not reliable', warn: 'Check the photo', info: 'Note' };
  const notes = S.front.issues.map((i) =>
    `<div class="note ${i.level}"><b>${NOTE_TITLE[i.level]}</b>${esc(i.msg)}</div>`).join('');

  const p = res.pose;
  const poseLine = p
    ? `<div class="sides"><span>yaw ${p.yaw.toFixed(1)}&deg;</span><span>pitch ${p.pitch.toFixed(1)}&deg;</span><span>roll ${res.rollEyes.toFixed(1)}&deg;</span></div>`
    : '';

  const mutGroups = byMutability([...sum.notable, ...sum.slight]);
  const mutHtml = mutGroups.length ? `<div class="mut">
    ${mutGroups.map((g) => `<h4>${esc(g.info.label)}</h4><p>${esc(g.info.hint)}</p>
      <ul>${g.items.map((i) => `<li>${esc(i.label)} &mdash; ${esc(i.display)}${i.direction ? `: ${esc(i.direction)}` : ''}</li>`).join('')}</ul>`).join('')}
  </div>` : '';

  const lede = sum.notable.length === 0
    ? 'Nothing here sits far from its reference range. That is the ordinary result &mdash; most faces are unremarkable on most measurements.'
    : `<em>${sum.notable.length} of ${sum.total}</em> scored measurements sit well outside their reference: ${sum.notable.slice(0, 4).map((i) => esc(i.label.toLowerCase())).join(', ')}${sum.notable.length > 4 ? ', and others' : ''}. Outside the reference means uncommon, not worse; the reference is an average, and averages are not targets.`;

  const ancestryHtml = sum.ancestryOff.length ? `<div class="note warn">
    <b>Held out of the count</b>
    ${sum.ancestryOff.length === 1 ? 'One measurement sits' : `${sum.ancestryOff.length} measurements sit`} outside a reference drawn from a predominantly European sample
    (${sum.ancestryOff.map((i) => esc(i.label.toLowerCase())).join(', ')}).
    Farkas found population means for nasal width spanning about 14mm across 25 groups, so a value outside that band is usually a statement about the reference sample rather than about the face. Shown in place, excluded from the tally above.
  </div>` : '';

  host.innerHTML = `
    ${notes}
    <div class="section">
      <h3>Overview</h3>
      ${poseLine}
      <div class="stats">
        <div class="stat stat--passed"><b>${sum.typical.length}</b><span>typical</span></div>
        <div class="stat stat--subcritical"><b>${sum.slight.length}</b><span>slightly off</span></div>
        <div class="stat stat--failed"><b>${sum.notable.length}</b><span>well outside</span></div>
      </div>
      <p class="lede">${lede}</p>
      ${sum.unscored.length ? `<p class="gnote">${sum.unscored.length} further measurements are shown without a verdict: either the mesh measures something the published reference did not, or no reference exists. Open any of them to see which.</p>` : ''}
      ${ancestryHtml}
      ${mutHtml}
    </div>
    ${rows.map((g) => `<div class="section">
      <h3>${esc(g.label)}</h3>
      ${g.note ? `<p class="gnote">${esc(g.note)}</p>` : ''}
      ${g.items.map(rowHtml).join('')}
    </div>`).join('')}
    ${skinHtml()}
    <p class="fineprint">
      These are measurements of geometry, not judgements of a person. Reference ranges come from specific study populations, chiefly North American and European. Nothing here is a medical opinion.
    </p>`;

  host.querySelectorAll('.row').forEach((r) => {
    const id = r.dataset.metric;
    r.addEventListener('mouseenter', () => { S.front.highlight = id; repaint(); });
    r.addEventListener('mouseleave', () => { S.front.highlight = null; repaint(); });
    r.addEventListener('click', () => {
      const d = host.querySelector(`[data-detail="${id}"]`);
      d.hidden = !d.hidden; r.classList.toggle('open', !d.hidden);
    });
  });
}

function repaint() {
  if (!S.front.R) return;
  renderOverlay($('#overlay'), S.front.R, { layers: S.front.layers, highlight: S.front.highlight });
}

function skinHtml() {
  const sk = S.front.skin;
  if (!sk) return '';
  const tone = sk.skinTone;
  const sw = Object.values(sk.regions).filter((r) => !r.missing).map((r) => `
    <div class="sw">
      <div class="chipc" style="background:lab(${r.L.toFixed(1)}% ${r.a.toFixed(1)} ${r.b.toFixed(1)})"></div>
      <div class="swl">${esc(r.label)}<br><span class="swv">L* ${r.L.toFixed(1)}</span></div>
    </div>`).join('');
  const warn = sk.warnings.map((w) => `<div class="note warn"><b>Lighting</b>${esc(w)}</div>`).join('');
  const finds = sk.findings.map((f) => {
    if (f.id.startsWith('periorbital')) {
      return `<div class="finding"><b>${esc(f.label)}</b><span class="sev ${f.severity}">${f.severity}</span>
        <p>Under-eye is ${f.dL.toFixed(1)} L* ${f.dL > 0 ? 'darker' : 'lighter'} than the cheek below it (&Delta;E ${f.dE.toFixed(1)}).
        ${f.severity === 'none' ? 'That is within the range where the difference reads as ordinary shadow.'
          : f.type === 'vascular' ? 'The shift is toward blue rather than brown, which points to thin skin over the underlying vasculature rather than pigment. Vascular circles respond to sleep, hydration and head-of-bed position, and lasers and fillers treat them differently from pigment.'
          : 'The shift is toward brown, consistent with pigmentation rather than vasculature. Pigment responds to sun protection and topical agents over months, not to sleep.'}</p></div>`;
    }
    return `<div class="finding"><b>${esc(f.label)}</b><span class="sev ${f.severity}">${f.severity}</span>
      <p>a* runs ${f.da.toFixed(1)} above the facial median in this region &mdash; localised redness.</p></div>`;
  }).join('');
  return `<div class="section">
    <h3>Skin &mdash; regional colourimetry</h3>
    ${warn}
    ${tone ? `<div class="finding"><b>Overall tone</b>
      <p>L* ${tone.L.toFixed(1)}, a* ${tone.a.toFixed(1)}, b* ${tone.b.toFixed(1)} &mdash; ITA ${tone.ita.toFixed(1)}&deg; (${esc(tone.cls)}).
      ITA is the dermatological tone scale used to set UV-protection and laser parameters. Phone cameras auto-white-balance, so read this as indicative only.</p></div>` : ''}
    <div class="finding"><b>Tone evenness</b>
      <p>Spread across regions ${sk.sdAcross.toFixed(1)} L*, within-region texture ${sk.localSd.toFixed(1)} L*.
      Some of the across-region figure is lighting: the nose and forehead catch more light than the jaw in almost every photo.</p></div>
    ${finds}
    <div class="swatches">${sw}</div>
    <p class="gnote">Comparisons between regions of the same photo are meaningful; absolute colour is not. Turn on the skin-region layer to see exactly which pixels were read.</p>
  </div>`;
}

// ============================ PROFILE ============================
async function loadProfile(file) {
  const img = $('#pphoto');
  const src = await readImage(file).then((i) => i.src);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  $('#pdrop').hidden = true; $('#pviewer').hidden = false;
  S.profile = { img, pts: {}, next: 0, res: null };
  const cv = $('#poverlay'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  drawPlacer(); drawProfileOverlay(); computeAndDrawProfile();
}

$('#poverlay').addEventListener('click', (e) => {
  const img = $('#pphoto'); if (!img.naturalWidth) return;
  const r = $('#poverlay').getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * img.naturalWidth;
  const y = ((e.clientY - r.top) / r.height) * img.naturalHeight;
  const spec = PROFILE_POINTS[S.profile.next];
  if (!spec) { toast('All points placed. Click a point name below to re-place it.'); return; }
  S.profile.pts[spec.id] = { x, y };
  S.profile.next = Math.min(S.profile.next + 1, PROFILE_POINTS.length);
  drawPlacer(); drawProfileOverlay(); computeAndDrawProfile();
});

function undoProfilePoint() {
  const i = S.profile.next - 1;
  if (i < 0) return;
  delete S.profile.pts[PROFILE_POINTS[i].id];
  S.profile.next = i;
  drawPlacer(); drawProfileOverlay(); computeAndDrawProfile();
}

function drawPlacer() {
  const spec = PROFILE_POINTS[S.profile.next];
  const done = Object.keys(S.profile.pts).length;
  $('#placer').innerHTML = `
    <h3>${spec ? `Place: ${esc(spec.label)}` : 'All points placed'}</h3>
    <p>${spec ? esc(spec.hint) : 'Click any name below to re-place that point. Measurements update as you go.'}</p>
    <div class="ptrack">${PROFILE_POINTS.map((p, i) => `
      <span class="pdot ${S.profile.pts[p.id] ? 'done' : ''} ${i === S.profile.next ? 'now' : ''} ${p.optional ? 'opt' : ''}" data-i="${i}">${esc(p.label)}</span>`).join('')}</div>
    <p class="ptally">${done} of ${PROFILE_POINTS.length} placed. Optional points are dimmed; the two iris edges unlock millimetres.</p>`;
  $$('#placer .pdot').forEach((d) => d.addEventListener('click', () => {
    S.profile.next = +d.dataset.i; drawPlacer();
  }));
}

function drawProfileOverlay() {
  const cv = $('#poverlay'), g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const P = S.profile.pts;
  const u = Math.max(cv.width, cv.height) / 120;
  const res = S.profile.res;
  if (res && P.pronasale && P.pogonion) {
    g.strokeStyle = 'rgba(110,168,254,.85)'; g.lineWidth = u * 0.22; g.setLineDash([u, u * 0.8]);
    g.beginPath(); g.moveTo(P.pronasale.x, P.pronasale.y); g.lineTo(P.pogonion.x, P.pogonion.y); g.stroke();
    g.setLineDash([]);
  }
  if (P.tragion && P.orbitale) {
    g.strokeStyle = 'rgba(100,210,154,.7)'; g.lineWidth = u * 0.18; g.setLineDash([u * 0.7, u * 0.7]);
    g.beginPath(); g.moveTo(P.tragion.x, P.tragion.y); g.lineTo(P.orbitale.x, P.orbitale.y); g.stroke();
    g.setLineDash([]);
  }
  const chain = ['glabella', 'nasion', 'rhinion', 'pronasale', 'columella', 'subnasale',
    'labraleSup', 'stomion', 'labraleInf', 'sublabiale', 'pogonion', 'menton', 'cervical'];
  g.strokeStyle = 'rgba(255,209,102,.6)'; g.lineWidth = u * 0.16;
  g.beginPath();
  let started = false;
  for (const id of chain) {
    if (!P[id]) { started = false; continue; }
    if (!started) { g.moveTo(P[id].x, P[id].y); started = true; } else g.lineTo(P[id].x, P[id].y);
  }
  g.stroke();
  if (P.gonion && P.menton) { g.beginPath(); g.moveTo(P.gonion.x, P.gonion.y); g.lineTo(P.menton.x, P.menton.y); g.stroke(); }
  if (P.gonion && P.tragion) { g.beginPath(); g.moveTo(P.gonion.x, P.gonion.y); g.lineTo(P.tragion.x, P.tragion.y); g.stroke(); }

  for (const [id, p] of Object.entries(P)) {
    g.beginPath(); g.arc(p.x, p.y, u * 0.42, 0, Math.PI * 2);
    g.fillStyle = '#ffd166'; g.fill();
    g.lineWidth = u * 0.14; g.strokeStyle = '#0b0e14'; g.stroke();
  }
}

function computeAndDrawProfile() {
  const res = computeProfile(S.profile.pts);
  res.sex = S.sex || null;
  S.profile.res = res;
  const issues = profileQuality(S.profile.pts, res);
  const rows = buildProfileRows(res);
  $('#pscalehint').textContent = res.mmPerPx
    ? `Scale: ${res.mmPerPx.toFixed(3)} mm/px from iris` : 'Angles only — place the iris points for mm';

  if (!rows.length) {
    $('#preport').innerHTML = `<div class="note info"><b>Place the landmarks</b>Measurements appear as soon as the points they need are down. Start with glabella, nasion and the nose tip for the nasal angles.</div>`;
    return;
  }
  const extra = [];
  if (res.dorsum && Number.isFinite(res.dorsum.mm)) {
    const d = res.dorsum.mm;
    extra.push(`<div class="finding"><b>Dorsal contour</b><p>The mid-dorsum sits ${Math.abs(d).toFixed(1)}mm ${d > 0 ? 'in front of' : 'behind'} the straight line from nasal root to tip — ${Math.abs(d) < 0.8 ? 'essentially straight' : d > 0 ? 'a convex dorsum (hump)' : 'a concave dorsum (scoop)'}.</p></div>`);
  }
  if (res.chinProj && Number.isFinite(res.chinProj.mm)) {
    extra.push(`<div class="finding"><b>Chin projection</b><p>Pogonion sits ${Math.abs(res.chinProj.mm).toFixed(1)}mm ${res.chinProj.mm >= 0 ? 'in front of' : 'behind'} a vertical dropped from subnasale. Most balanced profiles land within a few millimetres either side of that line.</p></div>`);
  }
  if (res.thirds) {
    const t = res.thirds;
    extra.push(`<div class="finding"><b>Vertical proportion</b><p>${t.hasUpper
      ? `Upper ${t.upper.toFixed(1)}% · middle ${t.middle.toFixed(1)}% · lower ${t.lower.toFixed(1)}%`
      : `Middle ${t.middle.toFixed(1)}% &middot; lower ${t.lower.toFixed(1)}% of the lower two thirds (place trichion for the upper third).`}</p></div>`);
  }

  $('#preport').innerHTML = `
    ${issues.map((i) => `<div class="note ${i.level}"><b>${{ fail: 'Not reliable', warn: 'Check the photo', info: 'Note' }[i.level]}</b>${esc(i.msg)}</div>`).join('')}
    ${rows.map((g) => `<div class="section"><h3>${esc(g.label)}</h3>${g.items.map(rowHtml).join('')}</div>`).join('')}
    ${extra.length ? `<div class="section"><h3>Derived</h3>${extra.join('')}</div>` : ''}
    <p class="fineprint">
      Soft-tissue cephalometrics measure the skin surface, not bone. A radiographic gonial angle or ANB angle is a different number from anything here, and only a lateral cephalogram gives those.</p>`;

  $$('#preport .row').forEach((r) => r.addEventListener('click', () => {
    const d = $(`#preport [data-detail="${r.dataset.metric}"]`);
    d.hidden = !d.hidden; r.classList.toggle('open', !d.hidden);
  }));
}

// ============================ EXPORT ============================
$('#export').addEventListener('click', () => {
  const res = S.front.res;
  if (!res) return;
  const rows = buildRows(res, S.sex || null);
  const payload = {
    generated: new Date().toISOString(),
    reference: S.sex || 'both sexes',
    scale: { mmPerPx: res.scale.mmPerPx, irisPx: res.scale.irisPx, assumedIrisMm: 11.7 },
    pose: res.pose, quality: S.front.issues,
    dimensions: res.dims,
    metrics: Object.fromEntries(rows.flatMap((g) => g.items.map((i) => [i.id, {
      label: i.label, value: i.value, unit: i.unit, reference: i.refText,
      status: i.status, z: i.z, tier: i.tier, source: i.source,
    }]))),
    skin: S.front.skin ? {
      tone: S.front.skin.skinTone, findings: S.front.skin.findings,
      warnings: S.front.skin.warnings,
      regions: Object.fromEntries(Object.entries(S.front.skin.regions)
        .filter(([, r]) => !r.missing).map(([k, r]) => [k, { L: r.L, a: r.a, b: r.b, sdL: r.sdL }])),
    } : null,
    profile: S.profile.res ? Object.fromEntries(Object.entries(S.profile.res.metrics)
      .map(([k, v]) => [k, { label: PROFILE_LABELS[k], value: v.value }])) : null,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `prosopon-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  toast('Exported JSON. Use ⌘P for a printable report.');
});

window.addEventListener('resize', () => positionTrichionHandle());
window.__S = S;
