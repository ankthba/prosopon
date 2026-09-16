// Named anthropometric points on the MediaPipe 478-point face mesh.
//
// Every index below was verified empirically against a real detection rather
// than copied from a blog post: 152 is the lowest point of the mesh (menton),
// 4 is the most anterior (pronasale), 468/473 are the iris centres.
//
// LEFT/RIGHT are ANATOMICAL: the subject's own left and right. The subject's
// right side appears on the viewer's left (smaller x).

import { mid, dist, centroid, fitLine, norm as vnorm, sub } from './geom.js';

export const IDX = {
  // midline
  trichionApprox: 10,   // top of the mesh; sits near the hairline, not on it
  glabella: 9,          // between the brow heads
  nasion: 168,          // sellion: deepest point of the nasal root
  rhinion: 6,           // mid nasal dorsum
  pronasale: 4,         // nose tip (most anterior point)
  columella: 1,
  subnasale: 2,         // columella meets the philtrum
  labialeSuperius: 0,   // top of the upper vermilion (cupid's bow)
  stomionSup: 13,       // upper lip, inner vermilion edge
  stomionInf: 14,       // lower lip, inner vermilion edge
  labialeInferius: 17,  // bottom of the lower vermilion
  sublabiale: 18,       // mentolabial sulcus
  pogonion: 199,        // most anterior point of the chin
  menton: 152,          // lowest point of the chin

  // eyes - subject's RIGHT
  R_canthusLat: 33, R_canthusMed: 133,
  R_lidUpper: 159, R_lidLower: 145,
  R_iris: 468, R_irisLat: 471, R_irisMed: 469, R_irisTop: 470, R_irisBot: 472,
  // eyes - subject's LEFT
  L_canthusLat: 263, L_canthusMed: 362,
  L_lidUpper: 386, L_lidLower: 374,
  L_iris: 473, L_irisLat: 476, L_irisMed: 474, L_irisTop: 475, L_irisBot: 477,

  // brows (apex + head)
  R_browHead: 107, R_browApex: 105, R_browTail: 46,
  L_browHead: 336, L_browApex: 334, L_browTail: 276,

  // nose
  R_alare: 129, L_alare: 358,     // widest points of the alae
  R_alarCrease: 131, L_alarCrease: 360,
  R_nostrilBase: 98, L_nostrilBase: 327,

  // mouth
  R_cheilion: 61, L_cheilion: 291,   // mouth corners

  // lateral face
  R_zygion: 234, L_zygion: 454,      // cheekbone-level silhouette
  R_temple: 127, L_temple: 356,
  R_gonionApprox: 172, L_gonionApprox: 397,
};

// Ordered silhouette, walking from the subject's right temple down around the
// chin and back up the left. Derived from FACE_LANDMARKS_FACE_OVAL.
export const FACE_OVAL_ORDERED = [
  127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152,
  377, 400, 378, 379, 365, 397, 288, 361, 323, 454, 356,
];

// Lower-jaw silhouette only (gonion to gonion, through the chin).
export const JAW_ORDERED = [
  58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288,
];

// Same contour with extra points above each jaw angle, so the turn angle at
// the gonion can be measured with neighbours on both sides.
export const JAW_CONTEXT = [
  234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152,
  377, 400, 378, 379, 365, 397, 288, 361, 323, 454,
];

export const UPPER_LIP_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
export const LOWER_LIP_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
export const R_EYE_RING = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
export const L_EYE_RING = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];
export const R_BROW_RING = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
export const L_BROW_RING = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];

// Mean horizontal visible iris diameter in adults. Remarkably stable across
// age, sex and ancestry (~11.7mm, SD ~0.5), which makes it the standard
// scale reference for photographic facial measurement.
export const IRIS_DIAMETER_MM = 11.7;

/** Build a working point set from a MediaPipe landmark array. */
export function buildPoints(landmarks, imgW, imgH) {
  const P = landmarks.map((l) => ({ x: l.x * imgW, y: l.y * imgH, z: l.z * imgW }));
  const pt = (i) => P[i];
  const named = {};
  for (const [k, i] of Object.entries(IDX)) named[k] = pt(i);

  // Derived midline / construction points.
  named.stomion = mid(named.stomionSup, named.stomionInf);
  named.R_pupil = named.R_iris;
  named.L_pupil = named.L_iris;
  named.pupilMid = mid(named.R_pupil, named.L_pupil);
  named.canthusMedMid = mid(named.R_canthusMed, named.L_canthusMed);
  named.canthusLatMid = mid(named.R_canthusLat, named.L_canthusLat);
  named.cheilionMid = mid(named.R_cheilion, named.L_cheilion);
  named.gonionMid = mid(named.R_gonionApprox, named.L_gonionApprox);
  named.browHeadMid = mid(named.R_browHead, named.L_browHead);

  return { P, pt, named, imgW, imgH };
}

/** Millimetres-per-pixel from iris diameter, averaged over both eyes.
 *  Falls back to one eye if the other is unusable. */
export function mmScale(ctx) {
  const { named } = ctx;
  const rd = dist(named.R_irisLat, named.R_irisMed);
  const ld = dist(named.L_irisLat, named.L_irisMed);
  const usable = [rd, ld].filter((d) => d > 4);
  const px = usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : NaN;
  return {
    irisPx: px,
    mmPerPx: IRIS_DIAMETER_MM / px,
    asymmetryPct: Math.abs(rd - ld) / ((rd + ld) / 2) * 100,
  };
}

/** Orthogonal fit of the midsagittal axis through unpaired midline landmarks.
 *  Weighted toward the stable central structures. */
export function midlineAxis(ctx) {
  const { named } = ctx;
  const anchors = [
    named.glabella, named.nasion, named.rhinion, named.subnasale,
    named.labialeSuperius, named.stomion, named.labialeInferius,
    named.menton, named.pogonion,
    // paired midpoints keep the fit honest if one side is distorted
    named.canthusMedMid, named.pupilMid, named.cheilionMid,
  ];
  const { point, dir } = fitLine(anchors);
  // Orient the axis so it points downward in image coords.
  const d = dir.y >= 0 ? dir : { x: -dir.x, y: -dir.y };
  return { point, dir: vnorm(d), anchors };
}

/** Pitch offset of MediaPipe's canonical face model.
 *
 *  The transformation matrix is relative to the canonical mesh, whose neutral
 *  head is not at zero pitch. Measured on three independent studio portraits
 *  shot at camera level (Obama official portrait +9.75, Katherine Johnson
 *  +10.01, Marie Curie +9.31) the raw value clusters within 0.4 degrees, which
 *  is far too tight to be three coincidentally similar head positions.
 *  Subtracting the mean puts a level head near zero.
 *
 *  Treat corrected pitch as accurate to roughly +/-3 degrees: it is good
 *  enough to catch the chin-up and chin-down photos that wreck a report, and
 *  not good enough to quote to a decimal place. */
export const CANONICAL_PITCH_OFFSET = 9.69;

/** Head pose from MediaPipe's 4x4 facial transformation matrix (column-major).
 *
 *  Signs verified by rotating a test image through -20..+20 degrees: the roll
 *  term tracks applied rotation at slope -1 (hence the negation below), while
 *  pitch and yaw stay constant to within 0.5 degrees across the sweep.
 *
 *  Convention after correction: positive yaw = turned toward the subject's
 *  left, positive pitch = chin raised, positive roll = tilted toward the
 *  subject's right shoulder. */
export function headPose(matrixData) {
  if (!matrixData || matrixData.length < 16) return null;
  const m = matrixData;
  const r = (row, col) => m[col * 4 + row];
  const sy = Math.hypot(r(0, 0), r(1, 0));
  const singular = sy < 1e-6;
  let pitch, yaw, roll;
  if (!singular) {
    pitch = Math.atan2(r(2, 1), r(2, 2));
    yaw = Math.atan2(-r(2, 0), sy);
    roll = Math.atan2(r(1, 0), r(0, 0));
  } else {
    pitch = Math.atan2(-r(1, 2), r(1, 1));
    yaw = Math.atan2(-r(2, 0), sy);
    roll = 0;
  }
  const D = 180 / Math.PI;
  return {
    pitch: pitch * D - CANONICAL_PITCH_OFFSET,
    pitchRaw: pitch * D,
    yaw: yaw * D,
    roll: -roll * D,
  };
}

/** Roll measured directly from the inter-pupillary line. Independent of the
 *  pose matrix, and used to cross-check it. */
export function rollFromEyes(ctx) {
  const { named } = ctx;
  const d = sub(named.L_pupil, named.R_pupil);
  return Math.atan2(d.y, d.x) * (180 / Math.PI);
}
