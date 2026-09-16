// Report assembly: grouping, formatting, and plain-language interpretation.

import { NORMS, PROFILE_NORMS, MUTABILITY, TIER_LABEL, refFor, evaluate, fmtRef } from './norms.js';

export const GROUPS = [
  { id: 'proportion', label: 'Proportion & shape', ids: ['thirdsBalance', 'lowerThirdRatio', 'facialIndex', 'fwhr'] },
  { id: 'eyes', label: 'Eyes & brows', ids: ['canthalTilt', 'pflMm', 'pfhMm', 'pfhOverPfl', 'intercanthalMm', 'icdOverPfl', 'ipdMm', 'browApexPos', 'browEyeMm'] },
  { id: 'nose', label: 'Nose', ids: ['nasalWidthMm', 'nasalIndex', 'alarOverIcd', 'noseOverMouth'] },
  { id: 'mouth', label: 'Mouth & chin', ids: ['mouthWidthMm', 'vermilionRatio', 'vermilionOverLower3', 'philtrumMm', 'philtrumOverChin'] },
  { id: 'jaw', label: 'Jaw & lower face', ids: ['bigonialOverBizygo', 'jawAngleSharpness'] },
  { id: 'symmetry', label: 'Symmetry', ids: ['symmetryRms'] },
  { id: 'folk', label: 'Unvalidated metrics', ids: ['midfaceRatio', 'eyeSeparationRatio'], note: 'These circulate widely online but have no clinical literature behind them. Shown because people ask; not scored, and not evidence of anything.' },
];

export const LABELS = {
  thirdsBalance: 'Facial thirds — worst deviation',
  lowerThirdRatio: 'Lower third split',
  facialIndex: 'Facial index (height ÷ width)',
  fwhr: 'Facial width-to-height ratio',
  canthalTilt: 'Canthal tilt',
  pflMm: 'Eye width',
  pfhMm: 'Eye height',
  pfhOverPfl: 'Eye height ÷ width',
  intercanthalMm: 'Inner-corner distance',
  icdOverPfl: 'Eye spacing ÷ eye width',
  ipdMm: 'Interpupillary distance',
  browApexPos: 'Brow peak position',
  browEyeMm: 'Brow-to-lid distance',
  nasalWidthMm: 'Nose width',
  nasalIndex: 'Nasal index',
  alarOverIcd: 'Nose width ÷ eye spacing',
  noseOverMouth: 'Nose width ÷ mouth width',
  mouthWidthMm: 'Mouth width',
  vermilionRatio: 'Upper ÷ lower lip height',
  vermilionOverLower3: 'Lip height ÷ lower third',
  philtrumMm: 'Philtrum length',
  philtrumOverChin: 'Philtrum ÷ chin height',
  bigonialOverBizygo: 'Jaw width ÷ cheekbone width',
  jawAngleSharpness: 'Jaw corner angle (frontal)',
  symmetryRms: 'Asymmetry (RMS)',
  midfaceRatio: 'Midface ratio',
  eyeSeparationRatio: 'Eye separation ratio',
};

export const PROFILE_LABELS = {
  nasofrontal: 'Nasofrontal angle',
  nasolabial: 'Nasolabial angle',
  nasofacial: 'Nasofacial angle',
  nasomental: 'Nasomental angle',
  facialConvexity: 'Facial convexity',
  mentolabial: 'Mentolabial angle',
  eLineUpper: 'Upper lip vs E-line',
  eLineLower: 'Lower lip vs E-line',
  gonialSoft: 'Jaw angle (soft tissue)',
  mandibularPlane: 'Mandibular plane angle',
  ramusMandibleRatio: 'Ramus ÷ mandible',
  submentalCervical: 'Cervicomental angle',
  mentocervical: 'Mentocervical angle',
  goodeRatio: 'Nasal projection (Goode)',
};

export const PROFILE_GROUPS = [
  { id: 'pnose', label: 'Nose', ids: ['nasofrontal', 'nasolabial', 'nasofacial', 'goodeRatio'] },
  { id: 'pbalance', label: 'Profile balance', ids: ['nasomental', 'facialConvexity', 'eLineUpper', 'eLineLower', 'mentolabial'] },
  { id: 'pjaw', label: 'Jaw & neck', ids: ['gonialSoft', 'mandibularPlane', 'ramusMandibleRatio', 'mentocervical', 'submentalCervical'] },
];

const DECIMALS = {
  intercanthalMm: 1, ipdMm: 1, pflMm: 1, pfhMm: 1, nasalWidthMm: 1, mouthWidthMm: 1,
  philtrumMm: 1, browEyeMm: 1, symmetryRms: 2, facialIndex: 1, nasalIndex: 1,
  thirdsBalance: 1, vermilionOverLower3: 1, canthalTilt: 1, jawAngleSharpness: 0,
};

export function fmtValue(id, v, unit) {
  if (!Number.isFinite(v)) return '—';
  const d = DECIMALS[id] ?? (unit === 'mm' || unit === '°' || unit === '%' ? 1 : 2);
  const s = v.toFixed(d);
  const u = unit === 'ratio' || unit === 'index' || unit === 'fraction' ? '' : unit;
  return `${s}${u}`;
}

/** Direction-aware phrasing for a value outside its reference. */
function describeDirection(id, value, ref, entry) {
  const high = ref.kind === 'nm' ? value > ref.mean : value > ref.hi;
  const P = {
    thirdsBalance: ['', 'your thirds are more uneven than the canon'],
    lowerThirdRatio: ['the gap from nose to lips is short relative to the chin', 'the gap from nose to lips is long relative to the chin'],
    facialIndex: ['a broader, shorter face than the reference mean', 'a longer, narrower face than the reference mean'],
    fwhr: ['a narrower face relative to its height', 'a wider face relative to its height'],
    canthalTilt: ['the outer corners sit low relative to the inner corners — a neutral or downward tilt', 'a pronounced upward tilt'],
    pflMm: ['shorter eye openings than average', 'longer eye openings than average'],
    pfhMm: ['a narrower eye opening — check this was a relaxed, non-squinting expression', 'a taller eye opening than average'],
    pfhOverPfl: ['eyes read as narrow and long', 'eyes read as round'],
    intercanthalMm: ['closer-set eyes than average', 'wider-set eyes than average'],
    icdOverPfl: ['the gap between the eyes is narrower than one eye width', 'the gap between the eyes is wider than one eye width'],
    ipdMm: ['', ''],
    browApexPos: ['the brow peaks toward the inner end', 'the brow peaks toward the outer end'],
    browEyeMm: ['brows sit low over the eyes', 'brows sit high over the eyes'],
    nasalWidthMm: ['a narrower nose than the reference sample', 'a wider nose than the reference sample'],
    nasalIndex: ['a narrow (leptorrhine) nose', 'a broad (platyrrhine) nose'],
    alarOverIcd: ['the nose is narrower than the eye gap', 'the nose is wider than the eye gap'],
    noseOverMouth: ['a narrow nose relative to the mouth', 'a wide nose relative to the mouth'],
    mouthWidthMm: ['a narrower mouth than average', 'a wider mouth than average'],
    vermilionRatio: ['the lower lip is much fuller than the upper', 'the upper lip is as full as or fuller than the lower'],
    vermilionOverLower3: ['thin lips relative to the lower face', 'full lips relative to the lower face'],
    philtrumMm: ['a short philtrum', 'a long philtrum'],
    philtrumOverChin: ['a short philtrum relative to the chin', 'a long philtrum relative to the chin'],
    bigonialOverBizygo: ['a strongly tapered face — narrow jaw under wider cheekbones', 'a square face — the jaw is nearly as wide as the cheekbones'],
    jawAngleSharpness: ['a sharply defined jaw corner', 'a soft, rounded jaw corner'],
    symmetryRms: ['', 'more left-right mismatch than typical'],
    midfaceRatio: ['a longer midface relative to eye spacing', 'a shorter, more compact midface'],
    eyeSeparationRatio: ['eyes set closer together relative to face width', 'eyes set further apart relative to face width'],
  }[id];
  if (!P) return '';
  return high ? P[1] : P[0];
}

export function buildRows(result, sex) {
  const rows = [];
  for (const g of GROUPS) {
    const items = [];
    for (const id of g.ids) {
      const m = result.metrics[id];
      const entry = NORMS[id];
      if (!m || !entry) continue;
      const ref = refFor(entry, sex);
      // Folk metrics have nothing to score against; uncalibrated ones measure
      // something the reference norm did not measure. Neither gets a verdict.
      const unscored = entry.tier === 'folk' || entry.uncalibrated === true
        || m.provisional === true;
      const ev = unscored ? { status: 'unscored' } : evaluate(m.value, ref);
      items.push({
        id, label: LABELS[id] || id, value: m.value, detail: m.detail,
        display: fmtValue(id, m.value, entry.unit),
        refText: unscored ? 'not scored' : fmtRef(ref, entry.unit),
        unit: entry.unit, tier: entry.tier, tierLabel: TIER_LABEL[entry.tier],
        status: ev.status, z: ev.z, pctile: ev.pctile,
        text: entry.text, source: entry.source,
        uncalibrated: entry.uncalibrated === true,
        provisional: m.provisional === true,
        ancestrySensitive: entry.ancestrySensitive === true,
        mutability: entry.mutability, mutabilityInfo: MUTABILITY[entry.mutability],
        direction: ev.status === 'typical' || ev.status === 'unscored' ? '' : describeDirection(id, m.value, ref, entry),
      });
    }
    if (items.length) rows.push({ ...g, items });
  }
  return rows;
}

export function buildProfileRows(res) {
  const rows = [];
  for (const g of PROFILE_GROUPS) {
    const items = [];
    for (const id of g.ids) {
      const m = res.metrics[id];
      const entry = PROFILE_NORMS[id];
      if (!m || !entry) continue;
      const ref = refFor(entry, res.sex);
      const ev = evaluate(m.value, ref);
      items.push({
        id, label: PROFILE_LABELS[id] || id, value: m.value,
        display: fmtValue(id, m.value, entry.unit),
        refText: fmtRef(ref, entry.unit), unit: entry.unit,
        tier: entry.tier, tierLabel: TIER_LABEL[entry.tier],
        status: ev.status, z: ev.z, text: entry.text, source: entry.source,
        mutability: entry.mutability, mutabilityInfo: MUTABILITY[entry.mutability],
      });
    }
    if (items.length) rows.push({ ...g, items });
  }
  return rows;
}

/** Headline summary: what actually stands out, ordered by how far it sits from
 *  the reference.
 *
 *  Three classes of metric are deliberately kept out of the tally. Folk metrics
 *  have no reference to be outside of. Uncalibrated ones measure something the
 *  norm did not measure. And ancestry-sensitive ones are the trap this whole
 *  genre falls into: counting a wide nose as a defect, when the reference
 *  sample was European and the face is not, is not a finding about the face.
 *  They are surfaced separately instead, where the caveat travels with them. */
export function summarise(rows) {
  const all = rows.filter((g) => g.id !== 'folk').flatMap((g) => g.items);
  const byZ = (a, b) => Math.abs(b.z || 0) - Math.abs(a.z || 0);
  const scored = all.filter((i) => !i.ancestrySensitive && !i.uncalibrated && !i.provisional);
  const ancestry = all.filter((i) => i.ancestrySensitive);
  return {
    notable: scored.filter((i) => i.status === 'notable').sort(byZ),
    slight: scored.filter((i) => i.status === 'slight').sort(byZ),
    typical: scored.filter((i) => i.status === 'typical'),
    unscored: all.filter((i) => i.uncalibrated || i.provisional),
    ancestry,
    // Only the ancestry-sensitive metrics that are still SCORED belong here;
    // the unscored ones already carry their own explanation on the row.
    ancestryOff: ancestry.filter((i) => !i.uncalibrated && i.status !== 'typical').sort(byZ),
    total: scored.length,
  };
}

/** Group standout findings by what it would actually take to change them. */
export function byMutability(items) {
  const m = {};
  for (const i of items) (m[i.mutability] ||= []).push(i);
  const order = ['grooming', 'posture', 'softTissue', 'ortho', 'surgical', 'fixed'];
  return order.filter((k) => m[k]).map((k) => ({ key: k, info: MUTABILITY[k], items: m[k] }));
}
