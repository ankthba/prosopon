import { FaceLandmarker, FilesetResolver } from '../vendor/tasks-vision/vision_bundle.mjs';
import { buildPoints, FACE_OVAL_ORDERED } from './landmarks.js';
import { computeFrontal, qualityCheck } from './metrics-front.js';
import { analyseSkin, itaClass } from './skin.js';
import { renderOverlay, LAYERS, DRAWERS } from './render.js';
import { buildRows, buildProfileRows, summarise, byMutability, fmtValue, PROFILE_LABELS, LABELS } from './report.js';
import { PROFILE_POINTS, computeProfile, profileQuality } from './metrics-profile.js';
import { NORMS, PROFILE_NORMS, refFor, MUTABILITY } from './norms.js';
import { METHOD_HTML } from './method.js';
import { analyseTexture } from './texture.js';
import { summariseComposites } from './composite.js';
import { buildProtocol, PROTOCOL_CAVEAT, EVIDENCE_GRADES } from './protocol.js';
import { MORPH_CONTROLS, targetLandmarks, buildTriangulation, renderMorph } from './morph.js';
import * as History from './history.js';
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
  morph: { settings: {}, tris: null, split: 50 },
  history: { pick: [] },
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
  $('#pane-preview').hidden = m !== 'preview';
  $('#pane-history').hidden = m !== 'history';
  $('#pane-method').hidden = m !== 'method';
  if (m === 'preview') drawPreviewPane();
  if (m === 'history') drawHistoryPane();
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
  try { S.front.texture = analyseTexture(ctx, img); }
  catch (e) { S.front.texture = null; S.front.textureError = String(e); }
  try { S.front.composites = summariseComposites(S.front.res, S.sex || null); }
  catch (e) { S.front.composites = null; }
  S.morph.settings = {}; S.morph.tris = null;
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
    ${compositeHtml()}
    ${textureHtml()}
    ${skinHtml()}
    ${protocolHtml(rows)}
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

/** Composites — averageness and dimorphism. Neither is scored, so neither gets
 *  a status dot; they render as figures with their basis attached. */
function compositeHtml() {
  const c = S.front.composites;
  if (!c) return '';
  const av = c.averageness, dm = c.dimorphism;
  const meter = (frac, leftLab, rightLab) => `
    <div class="meter"><div class="track">
      <u style="left:calc(${clampPct(frac)}% - .5px)"></u>
    </div><div class="ends"><span>${esc(leftLab)}</span><span>${esc(rightLab)}</span></div></div>`;

  const avHtml = Number.isFinite(av?.distance) ? `
    <div class="finding">
      <b>Averageness</b>
      <p>Procrustes distance ${av.distance.toFixed(4)} from the reference mean shape${
        Number.isFinite(av.z) ? `, ${av.z >= 0 ? '+' : ''}${av.z.toFixed(1)} SD against that set` : ''}.
      ${esc(av.interpretation || '')}</p>
      ${meter(Number.isFinite(av.z) ? (av.z + 3) / 6 * 100 : 50, 'closer to the mean', 'further from it')}
      <p class="srcline">${esc(av.meta?.basis || '')}</p>
    </div>` : '';

  const contribs = (dm?.contributions || []).filter((x) => Number.isFinite(x.z));
  const dmHtml = Number.isFinite(dm?.score) ? `
    <div class="finding">
      <b>Sexual dimorphism</b>
      <p>${esc(dm.direction || '')} ${esc(dm.note || '')}</p>
      ${meter((dm.score + 3) / 6 * 100, 'female reference', 'male reference')}
      ${contribs.length ? `<div class="contribs">${contribs.map((x) =>
        `<div><span>${esc(x.label || x.id)}</span><span>${x.z >= 0 ? '+' : ''}${x.z.toFixed(2)}</span></div>`).join('')}</div>` : ''}
      <p class="srcline">Confidence: ${esc(dm.confidence?.label || 'unknown')}.</p>
    </div>` : `<div class="finding"><b>Sexual dimorphism</b><p>${esc(dm?.note || 'Not computed.')}</p></div>`;

  return `<div class="section">
    <h3>Composites</h3>
    <p class="gnote">Neither of these is scored. They are positions on an axis, not verdicts, and the reference behind both is the eighteen-portrait validation set rather than a population.</p>
    ${avHtml}${dmHtml}
    ${(c.caveats || []).map((x) => `<p class="srcline">${esc(x)}</p>`).join('')}
  </div>`;
}

const clampPct = (v) => Math.max(0, Math.min(100, v));

/** Appearance markers. None has a published norm, so none is scored. */
function textureHtml() {
  const t = S.front.texture;
  if (!t) return S.front.textureError
    ? `<div class="section"><h3>Appearance</h3><div class="note warn"><b>Not computed</b>${esc(S.front.textureError)}</div></div>` : '';
  const num = (v, d = 1, suf = '') => (Number.isFinite(v) ? `${v.toFixed(d)}${suf}` : '—');
  const brow = (side) => {
    const b = t.brows?.[side];
    if (!b) return '';
    const name = side === 'R' ? 'right' : 'left';
    if (!b.ok) {
      return `<div class="opt"><span class="what">Brow density (${name})</span><span class="tags">—</span>
        <span class="ev">${b.refObstructed
          ? 'The forehead reference patch was too dark to be skin — usually a fringe, a hat or a shadow. Not measurable on this photo.'
          : 'Too few usable pixels to measure.'}</span></div>`;
    }
    return `<div class="opt"><span class="what">Brow density (${name})</span>
      <span class="tags">${num(b.coveredPct, 0, '%')}</span>
      <span class="ev">Hair covers ${num(b.coveredPct, 0, '%')} of the brow outline, separated from skin at L* ${num(b.thresholdL)} against a forehead reference of L* ${num(b.skinL)}.</span></div>`;
  };
  const iris = (side) => {
    const i = t.irises?.[side];
    if (!i || !i.ok) return '';
    const name = side === 'R' ? 'right' : 'left';
    return `<div class="opt"><span class="what">Iris (${name})
      <span class="sw" style="display:inline-block;width:.8em;height:.8em;border-radius:50%;background:${esc(i.hex || '#000')};vertical-align:middle;margin-left:.4em"></span></span>
      <span class="tags">${esc(i.category || '—')}</span>
      <span class="ev">L* ${num(i.L)}, chroma ${num(i.chroma)}, hue ${num(i.hue, 0)}°, ${i.n} px sampled.${
        i.category === 'indeterminate' ? ' Too dark and too desaturated to call a hue — a small, lidded or shadowed iris lands here.' : ''}</span></div>`;
  };
  return `<div class="section">
    <h3>Appearance markers</h3>
    <p class="gnote">${esc((t.warnings || [])[0] || '')}</p>
    ${brow('R')}${brow('L')}
    <div class="opt"><span class="what">Lip smoothness</span>
      <span class="tags">${num(t.lips?.smoothness, 0)}</span>
      <span class="ev">Scale calibrated so the reference set's median face sits at 50 and the set spans roughly 37–69; higher is smoother. Border sharpness ${num(t.lips?.borderSharpness, 2)} L* per 1% of eye spacing.</span></div>
    <div class="opt"><span class="what">Skin evenness</span>
      <span class="tags">${num(t.skin?.evennessPct, 0)}</span>
      <span class="ev">Residual SD ${num(t.skin?.textureEnergy, 2)} L* after a face-scaled blur, over cheeks and forehead. Conflates real texture with sensor noise, JPEG artefacts and any smoothing the camera applied.</span></div>
    ${iris('R')}${iris('L')}
    ${(t.warnings || []).slice(1).map((w) => `<p class="srcline">${esc(w)}</p>`).join('')}
  </div>`;
}

/** What could actually move a finding. Categories and evidence, never products. */
function protocolHtml(rows) {
  let items = [];
  try { items = buildProtocol(rows, { minStatus: 'slight' }); } catch (e) { return ''; }
  if (!items.length) return '';
  const grade = (g) => EVIDENCE_GRADES?.[g]?.label || g || '';
  return `<div class="section">
    <h3>What would move it</h3>
    <p class="gnote">${esc(PROTOCOL_CAVEAT?.short || PROTOCOL_CAVEAT?.text || '')}</p>
    ${items.map((it) => `
      <div class="step">
        <h4>${esc(it.label)} &middot; ${esc(it.display)}</h4>
        ${it.summary ? `<p class="srcline">${esc(it.summary)}</p>` : ''}
        ${it.options.slice(0, 4).map((o) => `
          <div class="opt">
            <span class="what">${esc(o.what || o.label || '')}</span>
            <span class="tags">
              <span class="badge">${esc(o.kind || '')}</span>
              ${o.reversible === true ? '<span class="badge">reversible</span>'
                : o.reversible === 'partial' ? '<span class="badge">partly reversible</span>'
                : '<span class="badge t-folk">permanent</span>'}
            </span>
            <span class="ev">${esc(grade(o.evidence?.grade))}${o.evidence?.citation ? ` &mdash; ${esc(o.evidence.citation)}` : ''}${
              o.timescale ? ` &middot; ${esc(o.timescale)}` : ''}</span>
          </div>`).join('')}
      </div>`).join('')}
    <p class="srcline">${esc(PROTOCOL_CAVEAT?.long || PROTOCOL_CAVEAT?.text || '')}</p>
  </div>`;
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

// ============================ PREVIEW (morph) ============================
//
// A piecewise-affine warp of the actual photograph, not a prediction. It shows
// what a proportion change would look like on these pixels; it cannot add
// tissue that is not in the image, and it goes rubbery past small adjustments,
// which is why the control ranges are clamped where they are.

function drawPreviewPane() {
  const ok = !!(S.front.res && S.front.img);
  $('#previewEmpty').hidden = ok;
  $('#previewViewer').hidden = !ok;
  if (!ok) { $('#previewPanel').innerHTML = '<div class="empty">Analyse a frontal photo first.</div>'; return; }

  $('#previewPanel').innerHTML = `
    <div class="section">
      <h3>Adjustments</h3>
      <p class="gnote">Each slider moves landmarks and warps the photograph to follow. Nothing here predicts a surgical result, and none of these targets is a goal &mdash; they are the canons the report spends its time qualifying.</p>
      ${MORPH_CONTROLS.map((c) => `
        <div class="ctl">
          <div class="ctlhead"><span>${esc(c.label)}</span>
            <span class="amt" data-amt="${c.id}">0${esc(c.unit || '')}</span></div>
          <input type="range" data-ctl="${c.id}" min="${c.min}" max="${c.max}"
                 step="${c.step}" value="0" aria-label="${esc(c.label)}">
          <p>${esc(c.hint)}</p>
        </div>`).join('')}
    </div>`;

  $$('#previewPanel input[data-ctl]').forEach((el) => {
    el.addEventListener('input', () => {
      const id = el.dataset.ctl;
      const v = parseFloat(el.value);
      S.morph.settings[id] = v;
      const spec = MORPH_CONTROLS.find((c) => c.id === id);
      const amt = $(`#previewPanel [data-amt="${id}"]`);
      amt.textContent = `${v > 0 ? '+' : ''}${v}${spec?.unit || ''}`;
      amt.classList.toggle('on', v !== 0);
      renderPreview();
    });
  });
  renderPreview();
}

function renderPreview() {
  const res = S.front.res, img = S.front.img;
  if (!res || !img) return;
  const cv = $('#morphCanvas');
  const maxW = Math.min(img.naturalWidth, 900);
  const k = maxW / img.naturalWidth;
  cv.width = Math.round(img.naturalWidth * k);
  cv.height = Math.round(img.naturalHeight * k);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);

  const srcAligned = res.aligned.P;
  let dstAligned;
  try { dstAligned = targetLandmarks(srcAligned, res, S.morph.settings); }
  catch (e) { dstAligned = srcAligned; }

  // Both sets live in the aligned frame; map back to image pixels to warp.
  const un = res.aligned.unrotate;
  const scalePt = (p) => ({ x: p.x * k, y: p.y * k });
  const srcPts = srcAligned.map((p) => scalePt(un(p)));
  const dstPts = dstAligned.map((p) => scalePt(un(p)));

  if (!S.morph.tris) {
    try { S.morph.tris = buildTriangulation(srcPts); } catch (e) { S.morph.tris = null; }
  }
  const changed = Object.values(S.morph.settings).some((v) => v);
  if (!changed || !S.morph.tris) {
    g.drawImage(img, 0, 0, cv.width, cv.height);
  } else {
    try { renderMorph(img, srcPts, dstPts, S.morph.tris, cv); }
    catch (e) { g.drawImage(img, 0, 0, cv.width, cv.height); }
  }

  // Split view: redraw the original over the left portion.
  const split = S.morph.split / 100;
  if (changed && split > 0) {
    g.save();
    g.beginPath(); g.rect(0, 0, cv.width * split, cv.height); g.clip();
    g.drawImage(img, 0, 0, cv.width, cv.height);
    g.restore();
  }
  $('#morphHandle').style.left = `${S.morph.split}%`;
  $('#morphHandle').hidden = !changed;
}

$('#morphSplit').addEventListener('input', (e) => {
  S.morph.split = +e.target.value; renderPreview();
});
$('#morphReset').addEventListener('click', () => {
  S.morph.settings = {};
  $$('#previewPanel input[data-ctl]').forEach((el) => { el.value = 0; });
  $$('#previewPanel .amt').forEach((el) => { el.textContent = '0'; el.classList.remove('on'); });
  renderPreview();
});

// ============================ HISTORY ============================
//
// Comparing a face against its own earlier photographs cancels the systematic
// biases that wreck comparison against a population: the landmark offsets, the
// millimetre scale bias, the European reference samples. All of them subtract
// out when the same pipeline measures the same person twice.

function drawHistoryPane() {
  const host = $('#historyPanel');
  let snaps = [];
  try { snaps = History.listSnapshots(); } catch (e) { snaps = []; }
  const canSave = !!S.front.res;

  host.innerHTML = `
    <h2>History</h2>
    <p>Measuring the same face twice cancels most of what makes a single reading
    unreliable. The landmark offsets, the roughly 8% millimetre bias and the
    European reference samples all subtract out of a difference, so change over
    time is measurable even where an absolute value is not. Photographs are
    never stored &mdash; only the numbers.</p>
    <div class="stagefoot" style="justify-content:flex-start;margin:1.5rem 0">
      <button class="btn" id="histSave"${canSave ? '' : ' disabled'}>Save current analysis</button>
      <button class="btn ghost sm" id="histExport"${snaps.length ? '' : ' disabled'}>Export</button>
      <button class="btn ghost sm" id="histImport">Import</button>
      <input type="file" id="histFile" accept="application/json" hidden>
    </div>
    ${snaps.length ? `
      <p class="gnote">Tick two to compare them.</p>
      <div class="snaplist">${snaps.map((sn) => `
        <label class="snap">
          <input type="checkbox" data-snap="${esc(sn.id)}">
          <span>${esc(sn.label || 'Untitled')}</span>
          <span class="when">${new Date(sn.at).toISOString().slice(0, 10)}</span>
          <button data-del="${esc(sn.id)}" title="Delete">remove</button>
        </label>`).join('')}</div>
      <div id="histDiff"></div>`
      : '<p class="gnote">Nothing saved yet. Analyse a photo, then save it here.</p>'}`;

  $('#histSave')?.addEventListener('click', () => {
    const rows = buildRows(S.front.res, S.sex || null);
    const sum = summarise(rows);
    const label = prompt('Label for this snapshot', new Date().toISOString().slice(0, 10));
    if (label === null) return;
    try {
      History.saveSnapshot({
        label,
        at: Date.now(),
        sex: S.sex || null,
        pose: S.front.res.pose,
        scale: { mmPerPx: S.front.res.scale.mmPerPx },
        tally: { typical: sum.typical.length, slight: sum.slight.length, notable: sum.notable.length },
        metrics: Object.fromEntries(rows.flatMap((g) => g.items.map((i) => [i.id, i.value]))),
      });
      toast('Saved.'); drawHistoryPane();
    } catch (e) { toast('Could not save: ' + e.message, 4000); }
  });

  $('#histExport')?.addEventListener('click', () => {
    try {
      const blob = new Blob([History.exportHistory()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `prosopon-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch (e) { toast('Export failed.'); }
  });
  $('#histImport')?.addEventListener('click', () => $('#histFile').click());
  $('#histFile')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = History.importHistory(await f.text(), { merge: true });
      toast(`Imported ${r.added}, skipped ${r.skipped}.`); drawHistoryPane();
    } catch (err) { toast('Import failed: ' + err.message, 4000); }
  });

  host.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.preventDefault();
    try { History.deleteSnapshot(b.dataset.del); } catch (e) {}
    drawHistoryPane();
  }));

  host.querySelectorAll('[data-snap]').forEach((cb) => cb.addEventListener('change', () => {
    const picked = [...host.querySelectorAll('[data-snap]:checked')].map((x) => x.dataset.snap);
    if (picked.length > 2) { cb.checked = false; return; }
    // The list renders newest first, so DOM order would hand diffSnapshots the
    // later photograph as the starting point and report every change backwards,
    // over a negative number of days. Order the pair by time, not by position.
    const at = Object.fromEntries(snaps.map((sn) => [sn.id, sn.at]));
    picked.sort((a, b) => (at[a] || 0) - (at[b] || 0));
    renderDiff(picked);
  }));
}

function renderDiff(picked) {
  const host = $('#histDiff');
  if (!host) return;
  if (picked.length !== 2) { host.innerHTML = ''; return; }
  let d;
  try { d = History.diffSnapshots(picked[0], picked[1]); }
  catch (e) { host.innerHTML = `<div class="note warn"><b>Could not compare</b>${esc(e.message)}</div>`; return; }
  if (!d || !d.changes) { host.innerHTML = ''; return; }

  const sum = d.summary || {};
  const pose = sum.pose || {};
  const poseLine = sum.poseKnown
    ? `yaw ${fmtNum(pose.yaw)}&deg; &middot; pitch ${fmtNum(pose.pitch)}&deg; &middot; roll ${fmtNum(pose.roll)}&deg;`
    : 'pose not recorded for one of these';

  const notes = [];
  if (sum.poseSuspect) {
    notes.push(`<div class="note warn"><b>Pose differs</b>The two photographs were not taken at the same head angle (${poseLine}). Head rotation moves these numbers more than most real change does, so treat the differences below as an upper bound.</div>`);
  }
  if (sum.scaleSuspect) {
    notes.push('<div class="note warn"><b>Scale differs</b>The millimetre calibration changed between the two photographs, so every absolute length below has shifted with it. The ratios are unaffected.</div>');
  }
  if (sum.sexChanged) {
    notes.push('<div class="note info"><b>Reference changed</b>These two were scored against different sex norms, so the verdicts are not directly comparable. The raw values still are.</div>');
  }

  host.innerHTML = `
    <h3 style="margin-top:2rem">Change over ${d.days} day${d.days === 1 ? '' : 's'}</h3>
    ${notes.join('')}
    <table class="difftable">
      <tr><th>Measurement</th><th>Before</th><th>After</th><th>Change</th></tr>
      ${d.changes.map((c) => `
        <tr class="${c.meaningful ? '' : 'quiet'}">
          <td>${esc(LABELS[c.id] || PROFILE_LABELS[c.id] || c.id)}</td>
          <td>${fmtNum(c.from)}</td>
          <td>${fmtNum(c.to)}</td>
          <td class="${c.delta > 0 ? 'up' : c.delta < 0 ? 'down' : 'flat'}">${
            c.delta > 0 ? '+' : ''}${fmtNum(c.delta)}${
            Number.isFinite(c.sd) ? ` (${c.sd >= 0 ? '+' : ''}${c.sd.toFixed(1)} SD)` : ''}</td>
        </tr>`).join('')}
    </table>
    <p class="srcline">
      ${sum.compared} measurement${sum.compared === 1 ? '' : 's'} compared, ${sum.meaningful} of them moved further than the measurement's own noise floor. Rows in grey did not, and should be read as unchanged.
      Pose difference: ${poseLine}.
    </p>`;
}

const fmtNum = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : '—');

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
