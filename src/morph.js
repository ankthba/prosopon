// Geometric before/after preview.
//
// The photograph is triangulated over its own landmarks, each triangle is
// given the affine map that carries its old position onto its new one, and the
// original pixels are resampled through that map. Nothing is generated,
// predicted or inferred: what comes out is the same photograph, pushed around.
//
// THIS IS NOT A SURGICAL PREDICTION and must not be presented as one. It has no
// model of bone, of soft-tissue thickness, of swelling or of healing, and no
// knowledge of what any procedure can actually achieve. It answers one
// question only — what would this photograph look like if this proportion were
// different — and that question is about the picture, not about the person.
//
// What a warp cannot do, all of it visible in the output if you look:
//
//   It moves pixels and cannot add tissue. Widening a jaw stretches the cheek
//   that is already in the frame; it does not add mandible, and the pores and
//   stubble stretch with it.
//
//   Light does not follow the geometry. Shadows, specular highlights and the
//   shading that tells the eye a nose is round stay where the old surface put
//   them, so an edited shape is lit as though it had never been edited. This is
//   why a warped nose reads as a flattened nose rather than a narrow one.
//
//   It goes rubbery quickly. Past small adjustments straight lines in the
//   background bow, texture smears along the direction of the pull, and the
//   result stops reading as a photograph. The ranges in MORPH_CONTROLS are
//   clamped to roughly where that begins. They are limits of the technique,
//   chosen by eye, and are not clinical limits or published quantities.
//
// FRAME. The edit is computed in the midline-aligned frame that computeFrontal
// returns, so a rolled photograph is not sheared by an edit that assumes a
// vertical midline. Drawing happens in raw image coordinates. The caller
// bridges the two with res.aligned.unrotate:
//
//   const dstA = targetLandmarks(res.aligned.P, res, settings);
//   const src  = ctx.P;                           // raw image coordinates
//   const dst  = dstA.map(res.aligned.unrotate);
//   const tris = buildTriangulation(src);
//   renderMorph(img, src, dst, tris, canvas);
//
// Pass the SAME array to buildTriangulation and to renderMorph as srcPts. Both
// derive the fixed frame anchors from it, and the triangle indices that run
// past the end of the landmark array refer to those anchors by position.
//
// Handing targetLandmarks raw image points instead of aligned ones is not a
// small error on a rolled photograph. Every control's notion of vertical is the
// frame's, not the face's, so the edits go in subtly wrong directions and stop
// agreeing with each other: at 20 degrees of roll with the controls at their
// clamps, eight triangles turned inside out, where the same settings in the
// aligned frame fold nothing at twice the clamp.

import { clamp } from './geom.js';
import {
  IDX, JAW_CONTEXT, R_EYE_RING, L_EYE_RING, R_BROW_RING, L_BROW_RING,
  UPPER_LIP_OUTER, LOWER_LIP_OUTER,
} from './landmarks.js';

const FACE_POINTS = 468;   // mesh points lying on the face surface
const MESH_POINTS = 478;   // + the two iris rings, which are not warp vertices

// ---------------------------------------------------------------------------
// Tunables. None of these is a measurement or a norm; they are the numbers that
// decide how the warp looks, and they are here to be edited rather than
// believed. Nothing below is published or derived from anything, and none of it
// should be quoted as though it described a face.
// ---------------------------------------------------------------------------

// The support radius of each control's displacement field, as a fraction of
// this face's bizygomatic width, x and y separately. A control that moves a
// landmark has to drag its neighbours with it and let go smoothly, or the mesh
// tears at the edge of the moved group. Anisotropy matters: brow height wants a
// field that is wide and shallow, so that it lifts a band rather than a disc.
const FALLOFF = {
  // Thirds is the exception: its vertical radius scales with one facial third
  // rather than with face width, because that is the distance the edit has to
  // blend over and the two are not in fixed proportion across faces.
  thirds: { rx: 1.30, ryThird: 0.90 },
  lowerThird: { rx: 0.45, ry: 0.22 },
  canthalTilt: { rx: 0.20, ry: 0.13 },
  browHeight: { rx: 0.34, ry: 0.16 },
  noseWidth: { rx: 0.17, ry: 0.15 },
  lipFullness: { rx: 0.28, ry: 0.16 },
  chinHeight: { rx: 0.34, ry: 0.28 },
  jawWidth: { rx: 0.30, ry: 0.30 },
};

// How far the displacement carries along the jaw contour on either side of the
// gonion, as a multiplier per step. Eyeballed: a jaw that widens at exactly one
// contour point looks like a dent, and one that widens over the whole contour
// takes the chin with it.
const JAW_TAPER = [1, 0.6, 0.25];

// Triangles are clipped a fraction of a source pixel larger than the affine map
// that fills them, so that the edges of neighbouring triangles overlap instead
// of leaving a hairline between them.
//
// Measured, so that the next person does not have to: in Chrome this changes
// nothing, because Chrome does not antialias a clip path — every pixel centre
// falls wholly inside one triangle or the other, and a render at zero expansion
// produces no partial coverage at all. It is kept for the engines that do
// antialias the clip, where two adjacent triangles each cover a shared edge at
// about half alpha, compositing to roughly three-quarters and letting the
// unwarped photograph underneath show through as a fine mesh of seams.
const SEAM_EXPAND_PX = 0.5;

// The fixed anchor ring that holds the background still.
const FRAME = {
  margin: 0.55,    // fraction of the landmark bounding box to expand by
  perSide: 6,      // anchors along each edge of the ring
  quantum: 32,     // ring rectangle is snapped outward to this many pixels
};

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

// Every amount is signed and 0 means unchanged. Amounts are expressed as a
// percentage of a dimension of THIS face rather than in millimetres, for two
// reasons: the iris scale can fail outright on a small photograph, and a warp
// is an edit to a proportion, not a measurement of a length. The one exception
// is canthal tilt, which is an angle in both the literature and the edit.
export const MORPH_CONTROLS = [
  {
    id: 'thirds',
    label: 'Facial thirds',
    hint: 'Moves the brow line and the base of the nose toward exactly equal thirds, which is a drawing canon rather than an average face, so 100% is not a target.',
    min: -100, max: 100, step: 5, unit: '%',
  },
  {
    id: 'lowerThird',
    label: 'Mouth position',
    hint: 'Slides the mouth within the lower third; positive lengthens the upper lip and takes the same distance off the chin.',
    min: -8, max: 8, step: 0.5, unit: '%',
  },
  {
    id: 'canthalTilt',
    label: 'Canthal tilt',
    hint: 'Rotates each outer eye corner about its own inner corner, positive raising the outer corner.',
    min: -6, max: 6, step: 0.5, unit: '°',
  },
  {
    id: 'browHeight',
    label: 'Brow height',
    hint: 'Raises or lowers the whole brow group as a unit, as a percentage of the present brow-to-lid gap, holding the lid margins still.',
    min: -25, max: 25, step: 1, unit: '%',
  },
  {
    id: 'noseWidth',
    label: 'Alar width',
    hint: 'Scales the alar points about the nasal midline while the tip and the dorsum stay where they are.',
    min: -12, max: 12, step: 0.5, unit: '%',
  },
  {
    id: 'lipFullness',
    label: 'Lip fullness',
    hint: 'Scales the vermilion vertically about the stomion, so the lip borders move outward and the mouth opening does not.',
    min: -25, max: 25, step: 1, unit: '%',
  },
  {
    id: 'chinHeight',
    label: 'Chin height',
    hint: 'Lengthens or shortens the chin along the midline, as a percentage of stomion-to-menton, holding the jaw angles still.',
    min: -10, max: 10, step: 0.5, unit: '%',
  },
  {
    id: 'jawWidth',
    label: 'Jaw width',
    hint: 'Scales the jaw angles about the midline, holding the cheekbones and the chin still; the background behind the jaw bends with it.',
    min: -8, max: 8, step: 0.5, unit: '%',
  },
];

// ---------------------------------------------------------------------------
// Displacement field
// ---------------------------------------------------------------------------

const xy = (p) => ({ x: p.x, y: p.y });
const usable = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

const uniq = (list) => Array.from(new Set(list));

const MIDLINE_IDS = [
  IDX.glabella, IDX.nasion, IDX.subnasale, IDX.labialeSuperius,
  IDX.stomionSup, IDX.menton, IDX.pogonion,
];
const MOUTH_GROUP = uniq([
  ...UPPER_LIP_OUTER, ...LOWER_LIP_OUTER, IDX.stomionSup, IDX.stomionInf,
]);
const LIP_BORDER = uniq([...UPPER_LIP_OUTER, ...LOWER_LIP_OUTER]);
// Both lid margins and both canthi. The lower lids are in the list because the
// field rings slightly on the far side of a pinned point, and a lower lid that
// rises a pixel while the brow lifts reads as a squint.
const LID_PINS = [
  IDX.R_lidUpper, IDX.L_lidUpper, IDX.R_lidLower, IDX.L_lidLower,
  IDX.R_canthusLat, IDX.R_canthusMed, IDX.L_canthusLat, IDX.L_canthusMed,
];

/** Reference dimensions taken from the points themselves, not from res, so the
 *  field stays correct if the caller hands over a point array it has already
 *  modified. */
function reference(pts) {
  let sx = 0, n = 0;
  for (const i of MIDLINE_IDS) {
    const p = pts[i];
    if (usable(p)) { sx += p.x; n += 1; }
  }
  const zR = pts[IDX.R_zygion], zL = pts[IDX.L_zygion];
  return {
    midX: n ? sx / n : 0,
    faceW: usable(zR) && usable(zL) ? Math.abs(zL.x - zR.x) : 0,
  };
}

const radii = (id, faceW) => ({
  rx: FALLOFF[id].rx * faceW,
  ry: FALLOFF[id].ry * faceW,
});

const driver = (at, dx, dy, r) => ({ x: at.x, y: at.y, dx, dy, rx: r.rx, ry: r.ry });

/** A driver with no displacement. Pins are how a control is told what it may
 *  not move: the lid margin when the brow lifts, the jaw angle when the chin
 *  lengthens. Without them the falloff happily drags the whole face along. */
const pin = (at, r) => driver(at, 0, 0, r);

/** Wendland C2 radial basis: (1 - r)^4 (4r + 1) inside the support, and exactly
 *  zero outside it.
 *
 *  Two properties are being bought here. Compact support: the frame anchors are
 *  fixed by definition, so a field that is merely small at the frame rather
 *  than zero disagrees with them, and the disagreement shows up as a shear in
 *  the triangles that span the gap. Positive definiteness: the interpolation
 *  matrix below is then invertible for any set of distinct constraint points,
 *  so the solve cannot fail on a face with an unusual landmark spread. A
 *  Gaussian interpolates as well but never reaches zero. */
function phi(r) {
  if (r >= 1) return 0;
  const u = 1 - r;
  return u * u * u * u * (4 * r + 1);
}

/** Distance from a driver in units of its own elliptical support. */
function radiusFrom(px, py, d) {
  return Math.hypot((px - d.x) / d.rx, (py - d.y) / d.ry);
}

// Added to the diagonal of the interpolation matrix. It buys conditioning
// against two constraints that sit almost on top of each other, at the cost of
// satisfying the constraints to about six figures instead of exactly.
const RIDGE = 1e-6;

/** Solve for the basis weights whose field reproduces every driver's
 *  displacement at the driver's own position.
 *
 *  Evaluating the drivers as a weighted average is the obvious alternative and
 *  it is wrong in a way that is easy to miss: a single pin holding the lid
 *  still is outvoted by the ten brow points that surround it, so the average
 *  carries the lid half as far as the brow and the eye opens while the brow
 *  lifts. Interpolating instead of averaging makes every constraint bind, pins
 *  included.
 *
 *  Gaussian elimination with partial pivoting, both right-hand sides carried
 *  through the same elimination. The systems are at most a few dozen rows. */
function solveWeights(ds) {
  const n = ds.length;
  const A = [];
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(n + 2);
    for (let j = 0; j < n; j++) row[j] = phi(radiusFrom(ds[i].x, ds[i].y, ds[j]));
    row[i] += RIDGE;
    row[n] = ds[i].dx;
    row[n + 1] = ds[i].dy;
    A.push(row);
  }
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (!(Math.abs(A[piv][c]) > 1e-12)) return null;
    if (piv !== c) { const t = A[piv]; A[piv] = A[c]; A[c] = t; }
    const pr = A[c], pv = pr[c];
    for (let r = c + 1; r < n; r++) {
      const row = A[r];
      const f = row[c] / pv;
      if (!f) continue;
      for (let k = c; k <= n + 1; k++) row[k] -= f * pr[k];
    }
  }
  const lx = new Float64Array(n), ly = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sx = A[i][n], sy = A[i][n + 1];
    for (let j = i + 1; j < n; j++) { sx -= A[i][j] * lx[j]; sy -= A[i][j] * ly[j]; }
    lx[i] = sx / A[i][i];
    ly[i] = sy / A[i][i];
    if (!Number.isFinite(lx[i]) || !Number.isFinite(ly[i])) return null;
  }
  return { lx, ly };
}

/** Two constraints at the same place are contradictory, and a matrix with two
 *  identical rows is singular. The builders are written so it does not happen;
 *  this is the guard for the case where a landmark lands on top of another. */
function dedupeDrivers(drivers) {
  const seen = new Set();
  const out = [];
  for (const d of drivers) {
    if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
    if (!(d.rx > 0) || !(d.ry > 0)) continue;
    const key = `${Math.round(d.x * 64)}:${Math.round(d.y * 64)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** Accumulate one control's displacement field into `disp`. */
function accumulate(disp, pts, drivers) {
  const ds = dedupeDrivers(drivers);
  if (ds.length < 1) return;
  const w = solveWeights(ds);
  if (!w) return;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!usable(p)) continue;
    let ax = 0, ay = 0;
    for (let j = 0; j < ds.length; j++) {
      const b = phi(radiusFrom(p.x, p.y, ds[j]));
      if (b === 0) continue;
      ax += w.lx[j] * b;
      ay += w.ly[j] * b;
    }
    disp[i].x += ax;
    disp[i].y += ay;
  }
}

// ---------------------------------------------------------------------------
// Per-control driver sets. All of them work in the aligned frame, where the
// midline is vertical and y grows downward.
// ---------------------------------------------------------------------------

function thirdsDrivers(pts, res, amt, ref) {
  const gla = pts[IDX.glabella], sub = pts[IDX.subnasale], men = pts[IDX.menton];
  if (!usable(gla) || !usable(sub) || !usable(men)) return [];
  // res.trichion carries the hairline the user dragged, in the aligned frame.
  // The mesh's own top point sits at mid-forehead, so without that drag the
  // upper third is short on every face and this control aims at the wrong line.
  const topY = res && res.trichion && Number.isFinite(res.trichion.y)
    ? res.trichion.y : pts[IDX.trichionApprox].y;
  const total = men.y - topY;
  if (!(total > 0)) return [];
  const third = total / 3;
  const t = amt / 100;
  const r = { rx: FALLOFF.thirds.rx * ref.faceW, ry: FALLOFF.thirds.ryThird * third };
  return [
    driver({ x: ref.midX, y: gla.y }, 0, t * (topY + third - gla.y), r),
    driver({ x: ref.midX, y: sub.y }, 0, t * (topY + 2 * third - sub.y), r),
    // The hairline and the chin point define the thirds being equalised, so
    // they are pinned: if they drift, the target drifts with the edit.
    pin({ x: ref.midX, y: topY }, r),
    pin({ x: ref.midX, y: men.y }, r),
  ];
}

function lowerThirdDrivers(pts, res, amt, ref) {
  const sub = pts[IDX.subnasale], men = pts[IDX.menton];
  if (!usable(sub) || !usable(men)) return [];
  const lower = men.y - sub.y;
  if (!(lower > 0)) return [];
  const dy = (amt / 100) * lower;
  const r = radii('lowerThird', ref.faceW);
  const out = [];
  for (const i of MOUTH_GROUP) if (usable(pts[i])) out.push(driver(pts[i], 0, dy, r));
  out.push(pin(sub, r), pin(men, r));
  return out;
}

function canthalTiltDrivers(pts, res, amt, ref) {
  const r = radii('canthalTilt', ref.faceW);
  const rad = amt * Math.PI / 180;
  // The two sides need OPPOSITE rotation signs to produce the same anatomical
  // tilt, for the same reason bilateralTiltDeg exists in geom.js: on the
  // subject's right the medial-to-lateral vector points in -x, so a rotation
  // that lifts the left outer corner drops the right one.
  const sides = [
    { ring: R_EYE_RING, med: IDX.R_canthusMed, lat: IDX.R_canthusLat, sign: 1 },
    { ring: L_EYE_RING, med: IDX.L_canthusMed, lat: IDX.L_canthusLat, sign: -1 },
  ];
  const out = [];
  for (const s of sides) {
    const m = pts[s.med], l = pts[s.lat];
    if (!usable(m) || !usable(l)) continue;
    const ax = l.x - m.x, ay = l.y - m.y;
    const len2 = ax * ax + ay * ay;
    if (!(len2 > 0)) continue;
    for (const i of s.ring) {
      const q = pts[i];
      if (!usable(q)) continue;
      const vx = q.x - m.x, vy = q.y - m.y;
      // Rotate each lid point by the full angle at the lateral end and by
      // nothing at the medial end, so the fissure pivots rather than swinging.
      const f = clamp((vx * ax + vy * ay) / len2, 0, 1);
      const th = rad * s.sign * f;
      const c = Math.cos(th), sn = Math.sin(th);
      out.push(driver(q, (vx * c - vy * sn) - vx, (vx * sn + vy * c) - vy, r));
    }
  }
  return out;
}

function browHeightDrivers(pts, res, amt, ref) {
  const gR = pts[IDX.R_lidUpper], gL = pts[IDX.L_lidUpper];
  const bR = pts[IDX.R_browApex], bL = pts[IDX.L_browApex];
  if (!usable(gR) || !usable(gL) || !usable(bR) || !usable(bL)) return [];
  const gap = (Math.abs(gR.y - bR.y) + Math.abs(gL.y - bL.y)) / 2;
  if (!(gap > 0)) return [];
  const dy = -(amt / 100) * gap;   // positive raises the brow, and up is -y
  const r = radii('browHeight', ref.faceW);
  const out = [];
  for (const i of [...R_BROW_RING, ...L_BROW_RING]) {
    if (usable(pts[i])) out.push(driver(pts[i], 0, dy, r));
  }
  // The lid margins are pinned: a brow that drags the upper lid with it opens
  // the palpebral aperture, which is a different edit and a conspicuous one.
  for (const i of LID_PINS) if (usable(pts[i])) out.push(pin(pts[i], r));
  return out;
}

function noseWidthDrivers(pts, res, amt, ref) {
  const k = amt / 100;
  const r = radii('noseWidth', ref.faceW);
  const out = [];
  for (const i of [IDX.R_alare, IDX.L_alare, IDX.R_alarCrease, IDX.L_alarCrease]) {
    const q = pts[i];
    if (usable(q)) out.push(driver(q, (q.x - ref.midX) * k, 0, r));
  }
  // The dorsum and the tip are pinned. Nothing pins the subnasale, because the
  // two alar drivers are symmetric about the midline and cancel there anyway.
  for (const i of [IDX.pronasale, IDX.rhinion]) {
    if (usable(pts[i])) out.push(pin(pts[i], r));
  }
  return out;
}

function lipFullnessDrivers(pts, res, amt, ref) {
  const ss = pts[IDX.stomionSup], si = pts[IDX.stomionInf];
  if (!usable(ss) || !usable(si)) return [];
  const ys = (ss.y + si.y) / 2;
  const k = amt / 100;
  const r = radii('lipFullness', ref.faceW);
  const out = [];
  for (const i of LIP_BORDER) {
    const q = pts[i];
    if (usable(q)) out.push(driver(q, 0, (q.y - ys) * k, r));
  }
  // Pinning the inner vermilion edges keeps the mouth aperture where it is, so
  // the edit adds vermilion instead of parting the lips. The subnasale and the
  // mentolabial sulcus are pinned to keep the philtrum and chin out of it.
  out.push(pin(ss, r), pin(si, r));
  for (const i of [IDX.subnasale, IDX.sublabiale]) {
    if (usable(pts[i])) out.push(pin(pts[i], r));
  }
  return out;
}

function chinHeightDrivers(pts, res, amt, ref) {
  const ss = pts[IDX.stomionSup], si = pts[IDX.stomionInf], men = pts[IDX.menton];
  if (!usable(ss) || !usable(si) || !usable(men)) return [];
  const chinH = men.y - (ss.y + si.y) / 2;
  if (!(chinH > 0)) return [];
  const dy = (amt / 100) * chinH;
  const r = radii('chinHeight', ref.faceW);
  const reach = 0.22 * ref.faceW;
  const out = [];
  // The chin contour moves with the menton, tapering off toward the jaw so the
  // lengthening stays in the chin instead of dropping the whole mandible. The
  // bare indices are the menton's immediate neighbours in JAW_ORDERED, two
  // steps each way.
  for (const i of [IDX.menton, 148, 377, 176, 400, IDX.pogonion]) {
    const q = pts[i];
    if (!usable(q)) continue;
    const taper = Math.max(0, 1 - Math.abs(q.x - ref.midX) / reach);
    if (taper > 0) out.push(driver(q, 0, dy * taper, r));
  }
  out.push(pin(ss, r), pin(si, r));
  for (const i of [IDX.R_gonionApprox, IDX.L_gonionApprox]) {
    if (usable(pts[i])) out.push(pin(pts[i], r));
  }
  return out;
}

function jawWidthDrivers(pts, res, amt, ref) {
  const k = amt / 100;
  const r = radii('jawWidth', ref.faceW);
  const out = [];
  // computeFrontal locates each gonion as the most lateral jaw point below the
  // mouth, which is a better anchor than the fixed index; fall back to the
  // fixed one when the caller has no result to hand.
  const found = res && res.gonia ? res.gonia : null;
  const seats = [
    found && found.R ? found.R.idx : IDX.R_gonionApprox,
    found && found.L ? found.L.idx : IDX.L_gonionApprox,
  ];
  for (const seat of seats) {
    const at = JAW_CONTEXT.indexOf(seat);
    if (at < 0) continue;
    for (let off = -(JAW_TAPER.length - 1); off <= JAW_TAPER.length - 1; off++) {
      const j = JAW_CONTEXT[at + off];
      const q = j == null ? null : pts[j];
      if (!usable(q)) continue;
      out.push(driver(q, (q.x - ref.midX) * k * JAW_TAPER[Math.abs(off)], 0, r));
    }
  }
  // Without these pins the widening runs up into the cheekbones and down into
  // the chin, and the result is a bigger head rather than a wider jaw.
  for (const i of [IDX.R_zygion, IDX.L_zygion, IDX.menton]) {
    if (usable(pts[i])) out.push(pin(pts[i], r));
  }
  return out;
}

const BUILDERS = {
  thirds: thirdsDrivers,
  lowerThird: lowerThirdDrivers,
  canthalTilt: canthalTiltDrivers,
  browHeight: browHeightDrivers,
  noseWidth: noseWidthDrivers,
  lipFullness: lipFullnessDrivers,
  chinHeight: chinHeightDrivers,
  jawWidth: jawWidthDrivers,
};

/** Adjusted landmark configuration.
 *
 *  `alignedPts` is a point array in the midline-aligned frame, normally
 *  res.aligned.P. `settings` is keyed by control id, each value a signed amount
 *  in that control's units; anything missing, zero or unparseable is ignored,
 *  and anything outside the control's range is clamped to it. The return is a
 *  fresh array of the same length in the same frame, so it indexes
 *  interchangeably with the input — including any extra points the caller has
 *  appended, which come back untouched as long as they lie outside every
 *  control's falloff.
 *
 *  The field reproduces each control's own displacements exactly at the
 *  landmarks that control drives, and overshoots them by a few percent in the
 *  gaps between them, which is the usual behaviour of an interpolant and is far
 *  below what the eye reads as wrong. Controls compose by summing their fields,
 *  which is exact only to first order: two edits overlapping the same tissue at
 *  their extremes will not sum to the arithmetic total. */
export function targetLandmarks(alignedPts, res, settings = {}) {
  const out = alignedPts.map((p) => (usable(p) ? xy(p) : { x: NaN, y: NaN }));
  const ref = reference(alignedPts);
  if (!(ref.faceW > 0)) return out;

  const disp = alignedPts.map(() => ({ x: 0, y: 0 }));
  for (const c of MORPH_CONTROLS) {
    const build = BUILDERS[c.id];
    const raw = Number(settings[c.id]);
    if (!build || !Number.isFinite(raw) || raw === 0) continue;
    const drivers = build(alignedPts, res, clamp(raw, c.min, c.max), ref);
    if (drivers.length) accumulate(disp, alignedPts, drivers);
  }
  for (let i = 0; i < out.length; i++) {
    out[i].x += disp[i].x;
    out[i].y += disp[i].y;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Triangulation
// ---------------------------------------------------------------------------

/** The fixed ring of anchor points that holds the background still.
 *
 *  Warping only the face is the classic failure: the jaw moves, the cheek
 *  behind it does not, and a seam opens along the silhouette. Anchoring a
 *  rectangle well outside the face and triangulating the gap gives the
 *  displacement somewhere to decay, so the background bends instead of tearing.
 *
 *  The ring is derived from the points rather than from the image because it
 *  has to be reproducible: buildTriangulation and renderMorph are separate
 *  calls with no shared state, and the triangle indices past the end of the
 *  landmark array only mean anything if both compute the same ring. The
 *  rectangle is snapped outward to a whole multiple of FRAME.quantum so that a
 *  triangulation built from the target configuration instead of the source
 *  still lands on the same ring. */
function frameAnchors(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const n = Math.min(points.length, FACE_POINTS);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (!usable(p)) continue;
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  if (!(x1 > x0) || !(y1 > y0)) return [];
  const mx = (x1 - x0) * FRAME.margin, my = (y1 - y0) * FRAME.margin;
  const q = FRAME.quantum;
  const ax0 = Math.floor((x0 - mx) / q) * q, ay0 = Math.floor((y0 - my) / q) * q;
  const ax1 = Math.ceil((x1 + mx) / q) * q, ay1 = Math.ceil((y1 + my) / q) * q;
  const corners = [[ax0, ay0], [ax1, ay0], [ax1, ay1], [ax0, ay1]];
  const out = [];
  for (let e = 0; e < 4; e++) {
    const [sx, sy] = corners[e];
    const [tx, ty] = corners[(e + 1) % 4];
    for (let k = 0; k < FRAME.perSide; k++) {
      const t = k / FRAME.perSide;
      out.push({ x: sx + (tx - sx) * t, y: sy + (ty - sy) * t });
    }
  }
  return out;
}

/** Circumcircle of a triangle, or null when the three points are collinear. */
function circumcircle(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const dx = a.x - ux, dy = a.y - uy;
  return { x: ux, y: uy, r2: dx * dx + dy * dy };
}

/** Bowyer-Watson Delaunay triangulation over `verts`, each carrying the index
 *  it should be reported as.
 *
 *  Exact duplicates are dropped first: two coincident vertices make the
 *  cavity-boundary step produce an edge that appears twice, and the
 *  triangulation comes apart from there. Points closer than 1/64 of a pixel
 *  count as coincident, which is far below anything the mesh produces. */
function delaunay(verts) {
  const seen = new Set();
  const pts = [];
  for (const v of verts) {
    const key = `${Math.round(v.x * 64)}:${Math.round(v.y * 64)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push(v);
  }
  if (pts.length < 3) return [];

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const span = Math.max(x1 - x0, y1 - y0) || 1;
  // A super-triangle at 20 spans is the usual compromise: small enough that
  // float precision still resolves the real points, large enough that no real
  // circumcircle reaches its vertices and distorts the hull.
  const base = pts.length;
  pts.push(
    { x: cx - 20 * span, y: cy - span, i: -1 },
    { x: cx, y: cy + 20 * span, i: -1 },
    { x: cx + 20 * span, y: cy - span, i: -1 },
  );

  const tri = (a, b, c) => ({ a, b, c, cc: circumcircle(pts[a], pts[b], pts[c]) });
  let tris = [tri(base, base + 1, base + 2)];

  for (let p = 0; p < base; p++) {
    const q = pts[p];
    const bad = [], kept = [];
    for (const t of tris) {
      // A degenerate triangle has no circumcircle; treating it as containing
      // everything means the next insertion always dissolves it.
      if (!t.cc) { bad.push(t); continue; }
      const dx = q.x - t.cc.x, dy = q.y - t.cc.y;
      (dx * dx + dy * dy <= t.cc.r2 * (1 + 1e-12) ? bad : kept).push(t);
    }
    if (!bad.length) continue;
    const edges = new Map();
    for (const t of bad) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const key = u < v ? `${u}_${v}` : `${v}_${u}`;
        const e = edges.get(key);
        if (e) e.n += 1; else edges.set(key, { u, v, n: 1 });
      }
    }
    tris = kept;
    // Edges seen twice are interior to the cavity and disappear with it.
    for (const e of edges.values()) if (e.n === 1) tris.push(tri(e.u, e.v, p));
  }

  const out = [];
  for (const t of tris) {
    const ia = pts[t.a].i, ib = pts[t.b].i, ic = pts[t.c].i;
    if (ia < 0 || ib < 0 || ic < 0) continue;
    out.push([ia, ib, ic]);
  }
  return out;
}

/** Triangulate a point array for the warp.
 *
 *  Vertices are the face points, plus anything the caller appended past the end
 *  of the mesh, plus the frame anchors this module adds. The iris rings are
 *  skipped: they sit inside the palpebral aperture, where they contribute
 *  nothing but slivers, and the eye interior is covered by the lid ring anyway.
 *
 *  Indices below points.length address the caller's array. Indices at or above
 *  it address the frame anchors, in the order frameAnchors produces them —
 *  which is why renderMorph must be handed the same array as srcPts. */
export function buildTriangulation(points) {
  const verts = [];
  for (let i = 0; i < points.length; i++) {
    if (i >= FACE_POINTS && i < MESH_POINTS) continue;
    const p = points[i];
    if (usable(p)) verts.push({ x: p.x, y: p.y, i });
  }
  const anchors = frameAnchors(points);
  for (let k = 0; k < anchors.length; k++) {
    verts.push({ x: anchors[k].x, y: anchors[k].y, i: points.length + k });
  }
  return delaunay(verts);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Affine that carries the source triangle onto the destination triangle,
 *  returned in canvas argument order for ctx.transform(a, b, c, d, e, f), where
 *  x' = a*x + c*y + e and y' = b*x + d*y + f.
 *
 *  Note the direction. The map that is useful to think about is destination to
 *  source — for each output pixel, where did it come from — but canvas draws
 *  forwards, so what gets installed is its inverse. Getting this backwards
 *  produces a face that moves the wrong way by exactly the right amount, which
 *  is a confusing thing to debug. */
function affineOnto(s0, s1, s2, d0, d1, d2) {
  const x1 = s1.x - s0.x, y1 = s1.y - s0.y;
  const x2 = s2.x - s0.x, y2 = s2.y - s0.y;
  const det = x1 * y2 - x2 * y1;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const u1 = d1.x - d0.x, v1 = d1.y - d0.y;
  const u2 = d2.x - d0.x, v2 = d2.y - d0.y;
  const a = (u1 * y2 - u2 * y1) / det;
  const c = (u2 * x1 - u1 * x2) / det;
  const b = (v1 * y2 - v2 * y1) / det;
  const d = (v2 * x1 - v1 * x2) / det;
  return { a, b, c, d, e: d0.x - a * s0.x - c * s0.y, f: d0.y - b * s0.x - d * s0.y };
}

/** Push a triangle's vertices out from its centroid by `px`, so that adjacent
 *  triangles overlap along their shared edge instead of meeting exactly on it.
 *  See SEAM_EXPAND_PX for which engines this matters on and why.
 *
 *  Only the clip is expanded; the affine map is not, so the fringe is filled by
 *  extrapolating the same map, which puts the neighbouring pixels there — what
 *  belongs there anyway.
 *
 *  This is an offset from the centroid rather than a true edge offset. For a
 *  sliver triangle the two differ; at half a pixel it does not matter. */
function expandTriangle(t, px) {
  const cx = (t[0].x + t[1].x + t[2].x) / 3;
  const cy = (t[0].y + t[1].y + t[2].y) / 3;
  return t.map((p) => {
    const dx = p.x - cx, dy = p.y - cy;
    const l = Math.hypot(dx, dy) || 1;
    return { x: p.x + dx / l * px, y: p.y + dy / l * px };
  });
}

/** Draw the warped photograph.
 *
 *  `source` is any drawable image, `srcPts` and `dstPts` are matching point
 *  arrays in raw image coordinates, `tris` comes from buildTriangulation over
 *  srcPts, and `canvas` is sized by the caller — this does not resize it, since
 *  that would discard whatever else the caller has put there. A canvas of a
 *  different size to the image is scaled to fit.
 *
 *  The unwarped photograph is drawn first. Every triangle then lands on top of
 *  it, so anything the triangulation does not cover — outside the anchor ring,
 *  or a triangle dropped as degenerate — still shows the original picture
 *  rather than a hole.
 *
 *  Cost is one clipped drawImage per triangle, roughly a thousand of them. That
 *  is fast enough to redraw on releasing a slider and too slow to redraw on
 *  every pointer move. */
export function renderMorph(source, srcPts, dstPts, tris, canvas) {
  const g = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!g || !tris || !tris.length) return;
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  if (!sw || !sh) return;

  // The anchors are the same points in both configurations, by definition: they
  // are what the displacement decays to zero against.
  const anchors = frameAnchors(srcPts);
  // A hole in either array (a missing landmark the caller left as null) has to
  // survive to the per-triangle usable() checks below rather than throwing here.
  const keep = (p) => (usable(p) ? xy(p) : { x: NaN, y: NaN });
  const S = srcPts.map(keep).concat(anchors);
  const D = dstPts.map(keep).concat(anchors);

  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.scale(canvas.width / sw, canvas.height / sh);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, sw, sh);

  for (const t of tris) {
    const s0 = S[t[0]], s1 = S[t[1]], s2 = S[t[2]];
    const d0 = D[t[0]], d1 = D[t[1]], d2 = D[t[2]];
    if (!usable(s0) || !usable(s1) || !usable(s2)) continue;
    if (!usable(d0) || !usable(d1) || !usable(d2)) continue;
    const m = affineOnto(s0, s1, s2, d0, d1, d2);
    if (!m) continue;
    const poly = expandTriangle([d0, d1, d2], SEAM_EXPAND_PX);
    g.save();
    g.beginPath();
    g.moveTo(poly[0].x, poly[0].y);
    g.lineTo(poly[1].x, poly[1].y);
    g.lineTo(poly[2].x, poly[2].y);
    g.closePath();
    g.clip();
    g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    g.drawImage(source, 0, 0, sw, sh);
    g.restore();
  }
  g.restore();
}
