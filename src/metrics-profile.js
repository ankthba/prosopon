// Profile (soft-tissue cephalometric) analysis.
//
// Points are placed by hand. That is deliberate, not a shortcut: automatic
// mesh fitting degrades badly past about 60 degrees of yaw, and a true lateral
// view is exactly where it fails. Hand-placed points are how cephalometric
// analysis is actually done, and on a clear profile photo they are more
// accurate than anything the mesh would produce.

import {
  dist, angleAt, signedDistToLine, distToLine, lineAngle, sub, round,
} from './geom.js';
import { IRIS_DIAMETER_MM } from './landmarks.js';

export const PROFILE_POINTS = [
  { id: 'trichion', label: 'Trichion', hint: 'Centre of the hairline. Skip if the hairline is receded or covered — only the upper-third figures use it.', optional: true },
  { id: 'glabella', label: 'Glabella', hint: 'The most forward point of the forehead, between the brows.' },
  { id: 'nasion', label: 'Nasion (sellion)', hint: 'The deepest point of the nasal root — the dip between brow and nose bridge.' },
  { id: 'rhinion', label: 'Rhinion', hint: 'Middle of the nasal dorsum, halfway from root to tip. Used to detect a hump or scoop.' },
  { id: 'pronasale', label: 'Pronasale', hint: 'The tip of the nose — its most forward point.' },
  { id: 'alarCrease', label: 'Alar crease', hint: 'Where the nostril wing meets the cheek.' },
  { id: 'columella', label: 'Columella', hint: 'Midpoint of the columella — the strip of skin between the nostrils, below the tip.' },
  { id: 'subnasale', label: 'Subnasale', hint: 'Where the base of the nose meets the upper lip.' },
  { id: 'labraleSup', label: 'Labrale superius', hint: 'The most forward point of the upper lip.' },
  { id: 'stomion', label: 'Stomion', hint: 'Where the lips meet.' },
  { id: 'labraleInf', label: 'Labrale inferius', hint: 'The most forward point of the lower lip.' },
  { id: 'sublabiale', label: 'Sublabiale', hint: 'The deepest point of the crease between the lower lip and the chin.' },
  { id: 'pogonion', label: 'Pogonion', hint: 'The most forward point of the chin.' },
  { id: 'menton', label: 'Menton', hint: 'The lowest point of the chin.' },
  { id: 'cervical', label: 'Cervical point', hint: 'The deepest point where the underside of the chin meets the neck.' },
  { id: 'gonion', label: 'Gonion', hint: 'The corner of the jaw — where the vertical edge in front of the ear turns into the horizontal jawline.' },
  { id: 'tragion', label: 'Tragion', hint: 'The notch just above the tragus, the small flap at the front of the ear canal.' },
  { id: 'orbitale', label: 'Orbitale', hint: 'The lowest point of the bony eye socket rim — just under the eye, on the cheek side.' },
  { id: 'neck', label: 'Neck point', hint: 'A point on the front of the neck, below the throat curve. Only needed for the cervicomental angle.', optional: true },
  { id: 'irisA', label: 'Iris edge (front)', hint: 'Front edge of the coloured part of the eye. Two iris edge points calibrate millimetres.', optional: true },
  { id: 'irisB', label: 'Iris edge (back)', hint: 'Back edge of the same iris, directly across from the first.', optional: true },
];

export const REQUIRED_POINTS = PROFILE_POINTS.filter((p) => !p.optional).map((p) => p.id);

/** Which way the subject faces in the image: +1 = facing image-right. */
function facing(p) {
  if (p.pronasale && p.tragion) return p.pronasale.x > p.tragion.x ? 1 : -1;
  if (p.pronasale && p.gonion) return p.pronasale.x > p.gonion.x ? 1 : -1;
  return 1;
}

export function computeProfile(P, opts = {}) {
  const have = (...ids) => ids.every((i) => P[i]);
  const M = {};
  const put = (id, value, extra = {}) => {
    if (Number.isFinite(value)) M[id] = { id, value, ...extra };
  };
  const f = facing(P);

  // Millimetre scale from the iris, if the two iris edge points were placed.
  let mmPerPx = null;
  if (have('irisA', 'irisB')) {
    const d = dist(P.irisA, P.irisB);
    if (d > 4) mmPerPx = IRIS_DIAMETER_MM / d;
  }
  const mm = (px) => (mmPerPx ? px * mmPerPx : NaN);

  if (have('glabella', 'nasion', 'pronasale')) put('nasofrontal', angleAt(P.glabella, P.nasion, P.pronasale));
  if (have('columella', 'subnasale', 'labraleSup')) put('nasolabial', angleAt(P.columella, P.subnasale, P.labraleSup));
  if (have('glabella', 'pogonion', 'nasion', 'pronasale')) put('nasofacial', lineAngle(P.glabella, P.pogonion, P.nasion, P.pronasale));
  if (have('nasion', 'pronasale', 'pogonion')) put('nasomental', angleAt(P.nasion, P.pronasale, P.pogonion));
  if (have('glabella', 'subnasale', 'pogonion')) put('facialConvexity', angleAt(P.glabella, P.subnasale, P.pogonion));
  if (have('labraleInf', 'sublabiale', 'pogonion')) put('mentolabial', angleAt(P.labraleInf, P.sublabiale, P.pogonion));

  // Ricketts E-line: nose tip to pogonion. Negative = lip sits behind the line.
  if (have('pronasale', 'pogonion', 'labraleSup')) {
    const d = signedDistToLine(P.labraleSup, P.pronasale, P.pogonion) * f;
    put('eLineUpper', mmPerPx ? -d * mmPerPx : NaN, { px: -d });
  }
  if (have('pronasale', 'pogonion', 'labraleInf')) {
    const d = signedDistToLine(P.labraleInf, P.pronasale, P.pogonion) * f;
    put('eLineLower', mmPerPx ? -d * mmPerPx : NaN, { px: -d });
  }

  if (have('tragion', 'gonion', 'menton')) put('gonialSoft', angleAt(P.tragion, P.gonion, P.menton));
  if (have('tragion', 'orbitale', 'gonion', 'menton')) put('mandibularPlane', lineAngle(P.gonion, P.menton, P.tragion, P.orbitale));
  if (have('tragion', 'gonion', 'menton')) put('ramusMandibleRatio', dist(P.gonion, P.tragion) / (dist(P.gonion, P.menton) || 1));
  if (have('menton', 'cervical', 'neck')) put('submentalCervical', angleAt(P.menton, P.cervical, P.neck));
  if (have('glabella', 'pogonion', 'menton', 'cervical')) put('mentocervical', lineAngle(P.glabella, P.pogonion, P.menton, P.cervical));
  if (have('nasion', 'pronasale', 'alarCrease')) {
    const proj = distToLine(P.pronasale, P.nasion, P.alarCrease);
    put('goodeRatio', proj / (dist(P.nasion, P.pronasale) || 1), { projMm: mm(proj) });
  }

  // Dorsal contour: signed offset of the mid-dorsum from the root-to-tip line.
  // Positive = convex (hump), negative = concave (scoop).
  let dorsum = null;
  if (have('nasion', 'pronasale', 'rhinion')) {
    const d = signedDistToLine(P.rhinion, P.nasion, P.pronasale) * f;
    dorsum = { px: -d, mm: mmPerPx ? -d * mmPerPx : NaN };
  }

  // Vertical proportion in profile.
  let thirds = null;
  if (have('glabella', 'subnasale', 'menton')) {
    const midT = Math.abs(P.subnasale.y - P.glabella.y);
    const lowT = Math.abs(P.menton.y - P.subnasale.y);
    const upT = P.trichion ? Math.abs(P.glabella.y - P.trichion.y) : null;
    const sum = (upT || 0) + midT + lowT;
    thirds = upT
      ? { upper: upT / sum * 100, middle: midT / sum * 100, lower: lowT / sum * 100, hasUpper: true }
      : { middle: midT / (midT + lowT) * 100, lower: lowT / (midT + lowT) * 100, hasUpper: false };
  }

  // Chin projection relative to a vertical dropped from subnasale (a quick
  // read on retrusion that does not depend on the nose).
  let chinProj = null;
  if (have('subnasale', 'pogonion')) {
    const d = (P.pogonion.x - P.subnasale.x) * f;
    chinProj = { px: d, mm: mm(d) };
  }

  const missing = REQUIRED_POINTS.filter((id) => !P[id]);
  return { metrics: M, mmPerPx, dorsum, thirds, chinProj, facing: f, missing };
}

/** Quality gate for the profile view. */
export function profileQuality(P, res) {
  const issues = [];
  if (!res.mmPerPx) {
    issues.push({ level: 'warn', code: 'scale', msg: 'No millimetre scale. Place the two iris edge points to unlock the E-line distances and chin projection in mm — the angles work without it.' });
  }
  if (P.tragion && P.pronasale && P.menton) {
    // A true lateral view puts the ear roughly level with the eye line and
    // shows the far side of the face not at all. A crude check: the horizontal
    // span from tragion to nose tip should clearly exceed the vertical span
    // from nose to chin if the head is turned toward the camera.
    const span = Math.abs(P.pronasale.x - P.tragion.x);
    const vert = Math.abs(P.menton.y - P.nasion?.y ?? P.menton.y);
    if (vert > 0 && span / vert < 0.75) {
      issues.push({ level: 'warn', code: 'notlateral', msg: 'This may not be a true 90° profile. If the far eyebrow or the far cheek is visible, the head is turned toward the camera and every angle here will read flatter than it is.' });
    }
  }
  if (res.missing.length) {
    issues.push({ level: 'info', code: 'incomplete', msg: `${res.missing.length} point${res.missing.length > 1 ? 's' : ''} still to place — some measurements are hidden until then.` });
  }
  return issues;
}
