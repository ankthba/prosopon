// Frontal morphometrics.
//
// Everything is computed in a MIDLINE-ALIGNED frame: the fitted midsagittal
// axis is rotated to vertical first, so a tilted photograph cannot leak into
// any width, height or tilt measurement.

import {
  dist, mid, sub, angleAt, tiltDeg, bilateralTiltDeg, signedDistToLine,
  projectOnLine, contourAngle, centroid, round, clamp,
} from './geom.js';
import {
  IDX, FACE_OVAL_ORDERED, JAW_ORDERED, JAW_CONTEXT, R_EYE_RING, L_EYE_RING,
  mmScale, midlineAxis, headPose, rollFromEyes,
} from './landmarks.js';

/** Rotate every point so the midline is vertical and the face is upright. */
export function alignToMidline(ctx) {
  const axis = midlineAxis(ctx);
  // Angle needed to bring the (downward) axis onto +y.
  const theta = Math.atan2(axis.dir.x, axis.dir.y);
  const c = Math.cos(theta), s = Math.sin(theta);
  const o = axis.point;
  const rot = (p) => {
    const dx = p.x - o.x, dy = p.y - o.y;
    return { x: o.x + dx * c - dy * s, y: o.y + dx * s + dy * c, z: p.z };
  };
  const P = ctx.P.map(rot);
  const named = {};
  for (const [k, v] of Object.entries(ctx.named)) named[k] = rot(v);
  return {
    ...ctx, P, named, pt: (i) => P[i],
    rollDeg: -theta * 180 / Math.PI,
    theta, origin: o,
    axisX: o.x,
    unrotate: (p) => {
      const dx = p.x - o.x, dy = p.y - o.y;
      return { x: o.x + dx * c + dy * s, y: o.y - dx * s + dy * c };
    },
  };
}

const W = (a, b) => Math.abs(a.x - b.x);   // width in the aligned frame
const H = (a, b) => Math.abs(a.y - b.y);   // height in the aligned frame

/** Widest silhouette span, and where it occurs. */
function silhouetteWidth(A) {
  const pts = FACE_OVAL_ORDERED.map((i) => A.P[i]);
  let best = { w: -1 };
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const w = W(pts[i], pts[j]);
      // only count roughly horizontal pairs, so we measure a true width
      if (w > best.w && H(pts[i], pts[j]) < w * 0.35) {
        best = { w, a: pts[i], b: pts[j], ia: FACE_OVAL_ORDERED[i], ib: FACE_OVAL_ORDERED[j] };
      }
    }
  }
  return best;
}

/** Locate each gonion on the jaw silhouette.
 *  Defined as the most lateral point of the jaw below the level of the mouth
 *  corners. Searching for maximum curvature instead is tempting, but the chin
 *  is the sharpest corner on that contour and wins every time. */
function findGonia(A) {
  const idxs = JAW_CONTEXT;
  const poly = idxs.map((i) => A.P[i]);
  const cx = A.named.menton.x;
  const yFloor = A.named.cheilionMid.y;
  const out = { R: null, L: null };
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    if (p.y < yFloor) continue;                    // above the mouth: cheek, not jaw
    const side = p.x < cx ? 'R' : 'L';
    const lateral = Math.abs(p.x - cx);
    if (!out[side] || lateral > out[side].lateral) out[side] = { lateral, p, idx: idxs[i], i };
  }
  for (const s of ['R', 'L']) {
    if (!out[s]) {
      const fb = s === 'R' ? IDX.R_gonionApprox : IDX.L_gonionApprox;
      out[s] = { lateral: NaN, p: A.named[`${s}_gonionApprox`], idx: fb, i: idxs.indexOf(fb) };
    }
    out[s].angle = out[s].i >= 0 ? contourAngle(poly, out[s].i, 3) : NaN;
    out[s].poly = poly;
  }
  return out;
}

/** Silhouette edge x at a given height, on a given side. */
function edgeAtHeight(A, y, side) {
  const pts = FACE_OVAL_ORDERED.map((i) => A.P[i]);
  const cx = A.named.menton.x;
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a.y - y) * (b.y - y) > 0) continue;        // segment does not straddle y
    const t = (y - a.y) / ((b.y - a.y) || 1);
    const x = a.x + (b.x - a.x) * t;
    const onSide = side === 'R' ? x < cx : x > cx;
    if (!onSide) continue;
    const score = side === 'R' ? x : -x;             // take the outermost
    if (!best || score < best.score) best = { x, y, score };
  }
  return best ? { x: best.x, y } : null;
}

/** Paired landmarks used for the symmetry breakdown. */
const SYM_PAIRS = {
  Eyes: [[33, 263], [133, 362], [159, 386], [145, 374], [468, 473], [130, 359], [243, 463]],
  Brows: [[107, 336], [105, 334], [46, 276], [63, 293], [52, 282]],
  Nose: [[129, 358], [98, 327], [131, 360], [49, 279], [64, 294]],
  Mouth: [[61, 291], [40, 270], [37, 267], [91, 321], [84, 314], [185, 409]],
  Cheeks: [[234, 454], [227, 447], [205, 425], [50, 280], [117, 346]],
  Jaw: [[172, 397], [136, 365], [150, 379], [149, 378], [58, 288]],
};

function symmetry(A, mmPerPx) {
  const axisX = A.named.menton.x; // in the aligned frame the midline is x = const
  // Use the mean x of unpaired midline points for a stabler axis.
  const mids = [IDX.glabella, IDX.nasion, IDX.subnasale, IDX.labialeSuperius,
    IDX.stomionSup, IDX.menton, IDX.pogonion].map((i) => A.P[i].x);
  const ax = mids.reduce((s, v) => s + v, 0) / mids.length;

  const regions = {};
  const all = [];
  for (const [region, pairs] of Object.entries(SYM_PAIRS)) {
    const devs = [];
    for (const [r, l] of pairs) {
      const pr = A.P[r], pl = A.P[l];
      if (!pr || !pl) continue;
      // Mirror the right point across x = ax and compare to the left point.
      const mirrored = { x: 2 * ax - pr.x, y: pr.y };
      const d = dist(mirrored, pl) * mmPerPx;
      devs.push(d);
      all.push(d);
    }
    const rms = Math.sqrt(devs.reduce((s, d) => s + d * d, 0) / (devs.length || 1));
    regions[region] = { rms, max: Math.max(...devs, 0) };
  }
  const rms = Math.sqrt(all.reduce((s, d) => s + d * d, 0) / (all.length || 1));
  // Directional summary: which side sits higher / wider.
  const eyeHeightDiff = (A.P[159].y - A.P[386].y) * mmPerPx;   // + => right eye lower
  const mouthTiltDeg = tiltDeg(A.P[61], A.P[291]);
  return { rms, regions, axisX: ax, eyeHeightDiff, mouthTiltDeg };
}

export function computeFrontal(ctx, opts = {}) {
  const { sex = null, trichionY = null, matrix = null } = opts;
  const A = alignToMidline(ctx);
  const n = A.named;
  const scale = mmScale(ctx);
  const k = scale.mmPerPx;
  const mm = (px) => px * k;

  // ---- reference dimensions ----
  const sil = silhouetteWidth(A);
  const faceWidthPx = sil.w;
  const gonia = findGonia(A);
  const bigonialPx = W(gonia.R.p, gonia.L.p);
  const trichion = { x: n.menton.x, y: trichionY != null ? trichionY : n.trichionApprox.y };

  const totalHeightPx = H(trichion, n.menton);
  const upper = H(trichion, n.glabella);
  const middle = H(n.glabella, n.subnasale);
  const lower = H(n.subnasale, n.menton);
  const thirdsSum = upper + middle + lower;

  const pflR = dist(n.R_canthusLat, n.R_canthusMed);
  const pflL = dist(n.L_canthusLat, n.L_canthusMed);
  const pfl = (pflR + pflL) / 2;
  const pfhR = H(A.P[159], A.P[145]);
  const pfhL = H(A.P[386], A.P[374]);
  const pfh = (pfhR + pfhL) / 2;
  const icd = W(n.R_canthusMed, n.L_canthusMed);
  const ipd = dist(n.R_pupil, n.L_pupil);
  const alar = W(n.R_alare, n.L_alare);
  const mouthW = W(n.R_cheilion, n.L_cheilion);
  const nasalH = H(n.nasion, n.subnasale);

  const tiltR = bilateralTiltDeg(n.R_canthusMed, n.R_canthusLat);
  const tiltL = bilateralTiltDeg(n.L_canthusMed, n.L_canthusLat);

  // Brow apex position as a fraction from inner to outer canthus.
  const browApex = (side) => {
    const ring = side === 'R'
      ? [70, 63, 105, 66, 107] : [300, 293, 334, 296, 336];
    const inner = side === 'R' ? n.R_canthusMed : n.L_canthusMed;
    const outer = side === 'R' ? n.R_canthusLat : n.L_canthusLat;
    let top = null;
    for (const i of ring) if (!top || A.P[i].y < top.y) top = A.P[i];
    const span = outer.x - inner.x;
    return { f: clamp((top.x - inner.x) / (span || 1), 0, 1), p: top };
  };
  const apexR = browApex('R'), apexL = browApex('L');

  const browEye = (side) => {
    const brow = side === 'R' ? A.P[105] : A.P[334];
    const lid = side === 'R' ? A.P[159] : A.P[386];
    return H(brow, lid);
  };

  const vermUpper = H(n.labialeSuperius, n.stomionSup);
  const vermLower = H(n.stomionInf, n.labialeInferius);
  const philtrum = H(n.subnasale, n.labialeSuperius);
  const chinH = H(n.stomion, n.menton);

  // Facial fifths, at pupil height.
  const eyeY = (n.R_pupil.y + n.L_pupil.y) / 2;
  const edgeR = edgeAtHeight(A, eyeY, 'R') || n.R_temple;
  const edgeL = edgeAtHeight(A, eyeY, 'L') || n.L_temple;
  const fifthBounds = [edgeR.x, n.R_canthusLat.x, n.R_canthusMed.x,
    n.L_canthusMed.x, n.L_canthusLat.x, edgeL.x];
  const fifthWidth = Math.abs(edgeL.x - edgeR.x) / 5;
  const fifths = [];
  for (let i = 0; i < 5; i++) {
    const w = Math.abs(fifthBounds[i + 1] - fifthBounds[i]);
    fifths.push({ w, pct: (w / (fifthWidth * 5)) * 100, devPct: ((w - fifthWidth) / fifthWidth) * 100 });
  }

  const sym = symmetry(A, k);
  const pose = headPose(matrix);

  // FWHR uses brow (upper lid of the brow line) to upper-lip height.
  const browLineY = Math.min(A.P[105].y, A.P[334].y);
  const fwhrHeight = Math.abs(n.labialeSuperius.y - browLineY);

  const rollEyes = rollFromEyes(ctx);

  const M = {};
  const put = (id, value, extra = {}) => { M[id] = { id, value, ...extra }; };

  put('thirdsBalance', Math.max(
    Math.abs(upper / thirdsSum * 100 - 33.333),
    Math.abs(middle / thirdsSum * 100 - 33.333),
    Math.abs(lower / thirdsSum * 100 - 33.333)),
    {
      detail: { upperPct: upper / thirdsSum * 100, middlePct: middle / thirdsSum * 100, lowerPct: lower / thirdsSum * 100 },
      // The mesh has no hairline landmark, so until the user drags the marker
      // the upper third is measured to mid-forehead and reads short on every
      // face. Scoring that would flag everyone.
      provisional: trichionY == null,
    });
  put('lowerThirdRatio', H(n.subnasale, n.stomion) / (chinH || 1));
  put('facialIndex', H(n.nasion, n.menton) / (faceWidthPx || 1) * 100);
  put('fwhr', faceWidthPx / (fwhrHeight || 1));

  put('canthalTilt', (tiltR + tiltL) / 2, { detail: { right: tiltR, left: tiltL } });
  put('intercanthalMm', mm(icd));
  put('icdOverPfl', icd / (pfl || 1));
  put('pflMm', mm(pfl), { detail: { right: mm(pflR), left: mm(pflL) } });
  put('pfhMm', mm(pfh), { detail: { right: mm(pfhR), left: mm(pfhL) } });
  put('pfhOverPfl', pfh / (pfl || 1));
  put('ipdMm', mm(ipd));
  put('browApexPos', (apexR.f + apexL.f) / 2, { detail: { right: apexR.f, left: apexL.f } });
  put('browEyeMm', mm((browEye('R') + browEye('L')) / 2),
    { detail: { right: mm(browEye('R')), left: mm(browEye('L')) } });

  put('nasalWidthMm', mm(alar));
  put('nasalIndex', alar / (nasalH || 1) * 100);
  put('alarOverIcd', alar / (icd || 1));
  put('noseOverMouth', alar / (mouthW || 1));

  put('mouthWidthMm', mm(mouthW));
  put('vermilionRatio', vermUpper / (vermLower || 1),
    { detail: { upperMm: mm(vermUpper), lowerMm: mm(vermLower) } });
  put('vermilionOverLower3', (vermUpper + vermLower) / (lower || 1) * 100);
  put('philtrumMm', mm(philtrum));
  put('philtrumOverChin', philtrum / (chinH || 1));

  put('bigonialOverBizygo', bigonialPx / (faceWidthPx || 1));
  put('jawAngleSharpness', (gonia.R.angle + gonia.L.angle) / 2,
    { detail: { right: gonia.R.angle, left: gonia.L.angle } });

  put('symmetryRms', sym.rms, {
    detail: sym.regions,
    yawSuspect: pose ? Math.abs(pose.yaw) > 3 : false,
  });

  put('midfaceRatio', ipd / (Math.abs(n.labialeSuperius.y - eyeY) || 1));
  put('eyeSeparationRatio', ipd / (faceWidthPx || 1));

  return {
    aligned: A,
    metrics: M,
    scale,
    sex,
    trichion,
    dims: {
      faceWidthMm: mm(faceWidthPx), bigonialMm: mm(bigonialPx),
      totalHeightMm: mm(totalHeightPx), nasalHeightMm: mm(nasalH),
      lowerThirdMm: mm(lower), chinHeightMm: mm(chinH),
    },
    thirds: { upper, middle, lower, sum: thirdsSum },
    fifths, fifthBounds, fifthWidth, eyeY,
    gonia, silhouette: sil, symmetry: sym,
    pose, rollEyes, rollFrame: A.rollDeg,
    edges: { R: edgeR, L: edgeL },
    apex: { R: apexR, L: apexL },
  };
}

/** Photo-quality gate. Measurements from a turned or tilted head are wrong in
 *  ways that look plausible, so this runs before anything is reported. */
export function qualityCheck(result, ctx) {
  const issues = [];
  const p = result.pose;
  if (p) {
    if (Math.abs(p.yaw) > 6) {
      issues.push({ level: Math.abs(p.yaw) > 12 ? 'fail' : 'warn', code: 'yaw',
        msg: `Head is turned ${Math.abs(p.yaw).toFixed(1)}° to the ${p.yaw > 0 ? 'subject’s left' : 'subject’s right'}. Turning the head compresses the far side of the face, which inflates every asymmetry and width measurement.` });
    }
    if (Math.abs(p.pitch) > 8) {
      issues.push({ level: Math.abs(p.pitch) > 15 ? 'fail' : 'warn', code: 'pitch',
        msg: `Head appears tilted ${p.pitch > 0 ? 'back' : 'forward'} by roughly ${Math.abs(p.pitch).toFixed(0)}° (±3°). This is the single biggest source of bogus results: pitch changes facial thirds, jaw width and chin height dramatically. Re-shoot with the camera at eye level before trusting the vertical proportions.` });
    }
  }
  if (Math.abs(result.rollEyes) > 4) {
    issues.push({ level: 'info', code: 'roll',
      msg: `Head is rolled ${Math.abs(result.rollEyes).toFixed(1)}°. Corrected automatically — all measurements are taken in a midline-aligned frame.` });
  }
  const sc = result.scale;
  if (!Number.isFinite(sc.mmPerPx) || sc.irisPx < 12) {
    issues.push({ level: 'fail', code: 'scale',
      msg: 'The iris is too small in this image to calibrate millimetres. Ratios are still valid; absolute sizes are not. Use a larger or closer photo.' });
  } else if (sc.irisPx < 25) {
    issues.push({ level: 'warn', code: 'scale-low',
      msg: `The iris spans only ${sc.irisPx.toFixed(0)}px, so millimetre values carry roughly ±${(11.7 / sc.irisPx * 1.5).toFixed(1)}mm of quantisation error.` });
  }
  if (sc.asymmetryPct > 8) {
    issues.push({ level: 'warn', code: 'iris-asym',
      msg: `The two irises differ in apparent width by ${sc.asymmetryPct.toFixed(0)}%, which usually means the head is turned or the lens is close enough to introduce perspective distortion.` });
  }
  const ipd = result.metrics.ipdMm?.value;
  if (Number.isFinite(ipd) && (ipd < 50 || ipd > 76)) {
    issues.push({ level: 'warn', code: 'ipd',
      msg: `Calibrated interpupillary distance came out at ${ipd.toFixed(0)}mm, outside the normal 52–74mm range. The scale reference is probably off — treat millimetre values with suspicion and rely on the ratios.` });
  }
  // Only when the harder out-of-range warning above has not already fired.
  if (Number.isFinite(ipd) && ipd >= 50 && ipd < 60) {
    issues.push({ level: 'info', code: 'scale-bias',
      msg: `Interpupillary distance reads ${ipd.toFixed(0)}mm. Across the validation portraits, iris-calibrated millimetre values ran about 8% below published population means, so every absolute millimetre figure here carries roughly that much systematic uncertainty on top of the ±0.5mm standard deviation of the iris itself. The ratios are the more trustworthy figures — they are unaffected by a scale bias that shifts all lengths together.` });
  }
  if (p && Math.abs(p.yaw) > 3) {
    issues.push({ level: 'info', code: 'yaw-sym',
      msg: `Asymmetry cannot be measured reliably at ${Math.abs(p.yaw).toFixed(1)}° of yaw. Turning the head foreshortens the far side, and that shows up as left-right mismatch that is not in the face. The asymmetry figure below is an upper bound, not a measurement.` });
  }
  const minDim = Math.min(ctx.imgW, ctx.imgH);
  if (minDim < 500) {
    issues.push({ level: 'warn', code: 'res', msg: `Image is only ${ctx.imgW}×${ctx.imgH}. Landmark precision degrades below about 800px on the short side.` });
  }
  return issues;
}
