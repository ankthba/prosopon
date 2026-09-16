// Composite scores: averageness, sexual dimorphism, and the percentile rule
// the rest of the report leans on.
//
// These are the three numbers that get screenshotted without the sentence that
// follows them, so each function returns the reference it was computed against
// inside its own result object rather than trusting a caller to reprint the
// caveat somewhere nearby.
//
// AVERAGENESS is one of the few genuinely replicated findings in this
// literature: composites built from many faces are rated more attractive than
// the faces that went into them, from Langlois & Roggman 1990 through a large
// body of work after it. The measure below is not that. The reference
// configuration is the Procrustes mean of EIGHTEEN validation portraits, and
// eighteen faces is a validation set, not a population — the published work
// builds its averages from hundreds. A distance measured here says where a
// face sits relative to those eighteen people and nothing more, which is why
// it is reported and never scored green or red.
//
// DIMORPHISM is a descriptive projection onto published sex differences, not a
// validated instrument. Nothing here is calibrated against a clinical scale,
// there is no published cut-point on the axis, and the axis does not rank
// anyone: sitting toward either reference is not a finding about a person, and
// a face that reads opposite to the sex its owner reported has been told
// something about four anthropometric means, not about themselves.
//
// Pure functions throughout — no DOM, no module state that outlives a call.

import { MEAN_SHAPE_META, procrustesDistance } from './mean-shape.js';
import { NORMS, normCdf } from './norms.js';

// Band edges for the averageness wording, in SDs of the reference distance
// distribution. These are the same 1 and 2 SD split that norms.evaluate() uses
// for every other measurement, reused so the language stays consistent across
// the report. There is no published threshold for shape distance, so they are
// a display convention and are overridable per call rather than stated as a
// norm.
const AVERAGENESS_BANDS = { near: 1, far: 2 };

// Width of the band, in pooled SDs either side of the midpoint between the two
// sex means, inside which the axis is described as sitting between the
// references rather than leaning toward one. No published basis — it exists so
// that a face near the midpoint is not given a direction it has not earned.
// Overridable per call for the same reason.
const DIMORPHISM_NEUTRAL_BAND = 0.25;

// Confidence bands, counted in surviving metrics. Also no published basis:
// they describe how thin the axis is, not how accurate it is. With the
// uncalibrated entries excluded the norm table currently supplies four usable
// metrics, so 'moderate' is the practical ceiling, and there is deliberately no
// 'high' — no number of entries from this table would turn the projection into
// a validated instrument.
const DIMORPHISM_CONFIDENCE_BANDS = [
  { min: 6, level: 'moderate' },
  { min: 3, level: 'low' },
  { min: 1, level: 'very low' },
];

// Sex-specific references that norms.js itself documents as weaker than the
// pair of numbers makes them look. Carried through to the caller so the
// workings can show the weakness rather than quietly averaging a placeholder in
// with measured population means.
const WEAK_SEX_REFERENCE = {
  canthalTilt: 'Both published figures available here were measured on white women; norms.js records the male column as a placeholder rather than a population value. The separation this metric contributes is therefore an artefact of that placeholder, not a measured sex difference.',
};

/** Read one measurement out of a metrics-front result map.
 *
 *  metrics-front emits `{ id, value, ... }` per measurement, but a caller
 *  holding a plain id → number map should get a score rather than a silent NaN.
 *  A measurement flagged `provisional` is one metrics-front has said is not yet
 *  measuring what it claims, so it cannot carry a sex signal either. */
function readValue(metrics, id) {
  const m = metrics ? metrics[id] : null;
  if (m == null) return NaN;
  if (typeof m === 'number') return Number.isFinite(m) ? m : NaN;
  if (m.provisional === true) return NaN;
  return Number.isFinite(m.value) ? m.value : NaN;
}

/** The norm-table entries that can legitimately feed a sex axis.
 *
 *  Derived from NORMS rather than written out as a list, so an entry that gains
 *  or loses a sex-specific reference — or gets flagged uncalibrated after a
 *  validation run — changes this axis without anyone remembering to edit a
 *  constant here.
 *
 *  The uncalibrated exclusion is not fastidiousness. Those entries measure
 *  something the reference sample did not measure: the mesh's alar points sit
 *  lateral to the palpated alare, its lateral canthus medial to the true ex. The
 *  gap between value and norm is therefore instrument error, and instrument
 *  error has no sex — projecting it onto this axis would move the score by
 *  several tenths of an SD for reasons that have nothing to do with the face.
 *  Folk entries are excluded on report.js's reasoning: a measurement the tool
 *  declines to score cannot contribute to a score.
 *
 *  Range references are excluded separately. Two target bands are not two
 *  distributions, so there is no pooled SD to express a position in. */
function sexSpecificPool() {
  const usable = [];
  let sexSpecific = 0;
  let excludedUnscored = 0;
  let excludedRange = 0;
  for (const [id, entry] of Object.entries(NORMS)) {
    if (!entry || !entry.male || !entry.female) continue;
    sexSpecific++;
    if (entry.tier === 'folk' || entry.uncalibrated === true) { excludedUnscored++; continue; }
    const male = entry.male;
    const female = entry.female;
    if (male.kind !== 'nm' || female.kind !== 'nm' || !(male.sd > 0) || !(female.sd > 0)) {
      excludedRange++;
      continue;
    }
    usable.push({ id, entry, male, female });
  }
  return { usable, sexSpecific, excludedUnscored, excludedRange };
}

/** Percentile of a value within a reference.
 *
 *  A normal reference has a distribution, so a percentile means something:
 *  normCdf(z) is the share of that distribution below the value.
 *
 *  A range reference does NOT. `rg(0.9, 1.1)` is a target band copied from a
 *  drawing canon or a surgical planning convention; it carries no mean, no SD
 *  and no sample. Any percentile derived from it — treating the band edges as
 *  quantiles, assuming a uniform distribution inside it, anything — would be a
 *  number invented on the spot and then quoted as if measured. Returning null
 *  forces the caller to print nothing instead. */
export function percentile(value, ref) {
  if (!ref || !Number.isFinite(value)) return null;
  if (ref.kind !== 'nm') return null;
  if (!Number.isFinite(ref.mean) || !(ref.sd > 0)) return null;
  return normCdf((value - ref.mean) / ref.sd) * 100;
}

/** Shape distance from the reference mean face.
 *
 *  `alignedP468` is the point array from the midline-aligned frame; the ten
 *  iris landmarks at the end of the 478-point mesh are dropped by
 *  procrustesDistance, which is correct here because they track gaze rather
 *  than shape.
 *
 *  Sign convention: the z is the z of the DISTANCE, so a lower distance means
 *  closer to the reference mean and a positive z means further from it. It is
 *  not an averageness score with a high-is-average orientation, and inverting
 *  it to make the bigger number the flattering one would be exactly the kind of
 *  thing this tool exists not to do. */
export function averageness(alignedP468, opts = {}) {
  const bands = { ...AVERAGENESS_BANDS, ...(opts.bands || {}) };
  const meta = {
    n: MEAN_SHAPE_META.n,
    points: MEAN_SHAPE_META.points,
    distMean: MEAN_SHAPE_META.distMean,
    distSd: MEAN_SHAPE_META.distSd,
    distMin: MEAN_SHAPE_META.distMin,
    distMax: MEAN_SHAPE_META.distMax,
    bands,
    basis: `Procrustes distance to the mean shape of the ${MEAN_SHAPE_META.n} validation portraits (src/mean-shape.js), whose own distances to that mean run ${MEAN_SHAPE_META.distMin}–${MEAN_SHAPE_META.distMax} with a mean of ${MEAN_SHAPE_META.distMean} and an SD of ${MEAN_SHAPE_META.distSd}. Eighteen faces is a validation set, not a population.`,
    sign: 'Lower distance is closer to the reference mean shape; positive z is further from it.',
    percentileMeaning: `Share of the reference distance distribution expected to sit closer to the mean shape than this face. The normal CDF is applied to a bounded, right-skewed distance estimated from ${MEAN_SHAPE_META.n} samples, so read it as a rank hint rather than a probability.`,
    // The caller must not give this a verdict colour. There is no reference
    // population behind it to be typical or atypical against.
    scored: false,
  };

  const usable = alignedP468
    && alignedP468.length >= MEAN_SHAPE_META.points
    && Number.isFinite(alignedP468[0] && alignedP468[0].x)
    && Number.isFinite(alignedP468[0] && alignedP468[0].y);
  if (!usable) {
    return {
      distance: NaN,
      z: NaN,
      percentile: null,
      interpretation: `Not computed: this needs all ${MEAN_SHAPE_META.points} face landmarks in the midline-aligned frame.`,
      meta,
    };
  }

  const { distance } = procrustesDistance(alignedP468);
  // A single non-finite landmark anywhere in the array makes the whole distance
  // NaN, and every comparison below would then be false — which would silently
  // produce the "closer to the mean shape than most" wording over a distance
  // that was never computed. Bail out with the same not-computed shape as a
  // missing array rather than narrating a NaN.
  if (!Number.isFinite(distance)) {
    return {
      distance: NaN,
      z: NaN,
      percentile: null,
      interpretation: `Not computed: the ${MEAN_SHAPE_META.points} landmarks did not yield a usable shape distance.`,
      meta,
    };
  }
  const z = (distance - meta.distMean) / meta.distSd;
  const pct = percentile(distance, { kind: 'nm', mean: meta.distMean, sd: meta.distSd });

  // Wording for the extremes is taken from the observed min and max rather than
  // from the z bands, because "further than any of them" is a claim about the
  // eighteen measured distances and z = 2 is not where that claim becomes true.
  const beyond = distance > meta.distMax
    ? `further from the mean shape than any of the ${meta.n} reference faces`
    : distance < meta.distMin
      ? `closer to the mean shape than any of the ${meta.n} reference faces`
      : null;
  const a = Math.abs(z);
  const where = beyond
    || (a <= bands.near
      ? 'about as close to the mean shape as the reference faces typically are'
      : z > 0
        ? 'further from the mean shape than most of the reference faces'
        : 'closer to the mean shape than most of the reference faces');

  const interpretation = `This face sits ${where} (Procrustes distance ${distance.toFixed(4)}, `
    + `z ${z >= 0 ? '+' : ''}${z.toFixed(2)} against ${meta.distMean} ± ${meta.distSd} over ${meta.n} portraits). `
    + 'Averageness is one of the few attractiveness findings that has replicated widely, but that literature '
    + `averages hundreds of faces and this reference is ${meta.n}. The figure says where this face sits relative `
    + `to those ${meta.n} people. It is reported, not scored, and it is not a measure of attractiveness.`;

  return { distance, z, percentile: pct, interpretation, meta };
}

/** Signed position on a sexual-dimorphism axis built from the tool's own norms.
 *
 *  For each usable metric the value is expressed in pooled SDs from the
 *  midpoint between the male and female reference means, signed so that
 *  positive is toward the male reference. The sign is applied per metric rather
 *  than assumed from the raw measurement, because the sexes lead in opposite
 *  directions depending on the metric — intercanthal distance is larger in men,
 *  brow-to-lid distance larger in women — and an unsigned average would cancel
 *  real information.
 *
 *  Metrics are weighted by |separation| in pooled SDs. A metric whose two sex
 *  means nearly coincide cannot tell the sexes apart at all, and giving it an
 *  equal vote would let a measurement carrying no information outweigh one that
 *  separates the references by most of an SD. The weight is the separation
 *  itself, so an uninformative metric contributes in proportion to how little
 *  it knows.
 *
 *  `sex` does not enter the arithmetic. It is carried into the note so the
 *  caller can state plainly that the axis describes measurements against
 *  published means and is not an opinion about the person. */
export function dimorphism(metrics, sex, opts = {}) {
  const neutral = Number.isFinite(opts.neutralBand) ? opts.neutralBand : DIMORPHISM_NEUTRAL_BAND;
  const { usable, sexSpecific, excludedUnscored, excludedRange } = sexSpecificPool();

  const contributions = [];
  for (const { id, entry, male, female } of usable) {
    const value = readValue(metrics, id);
    if (!Number.isFinite(value)) continue;
    const pooledSd = Math.sqrt((male.sd * male.sd + female.sd * female.sd) / 2);
    const separationSd = (male.mean - female.mean) / pooledSd;
    const midpoint = (male.mean + female.mean) / 2;
    const toward = separationSd >= 0 ? 1 : -1;
    contributions.push({
      id,
      value,
      unit: entry.unit,
      maleMean: male.mean,
      femaleMean: female.mean,
      pooledSd,
      separationSd,
      z: toward * (value - midpoint) / pooledSd,
      weight: Math.abs(separationSd),
      weightShare: 0,
      source: entry.source,
      caveat: WEAK_SEX_REFERENCE[id] || null,
    });
  }

  const totalWeight = contributions.reduce((acc, c) => acc + c.weight, 0);
  for (const c of contributions) c.weightShare = totalWeight > 0 ? c.weight / totalWeight : 0;
  const score = totalWeight > 0
    ? contributions.reduce((acc, c) => acc + c.z * c.weight, 0) / totalWeight
    : NaN;

  const n = contributions.length;
  const band = DIMORPHISM_CONFIDENCE_BANDS.find((b) => n >= b.min);
  const confidence = {
    level: band ? band.level : 'none',
    n,
    eligible: usable.length,
    sexSpecific,
    excludedUnscored,
    excludedRange,
    label: n === 0
      ? `No usable metrics: none of the ${usable.length} eligible sex-specific measurements were available on this face.`
      : `${band.level} confidence — ${n} metric${n === 1 ? '' : 's'} on the axis, out of ${sexSpecific} entries in the norm table that carry separate male and female references.`,
  };

  const direction = !Number.isFinite(score)
    ? 'undetermined'
    : score > neutral
      ? 'toward the male reference'
      : score < -neutral
        ? 'toward the female reference'
        : 'between the two references';

  const caveated = contributions.filter((c) => c.caveat);
  const note = [
    n === 0
      ? 'Not computed: no usable sex-specific measurement was available on this face.'
      : `Weighted projection onto ${n} metric${n === 1 ? '' : 's'} — ${contributions.map((c) => c.id).join(', ')} — in pooled SDs from the midpoint between the published male and female means, positive toward the male reference, weighted by how far apart those two means sit.`,
    `The norm table holds ${sexSpecific} entries with separate male and female references; ${excludedUnscored} are excluded as uncalibrated or unscored${excludedRange ? ` and ${excludedRange} for giving target ranges rather than distributions` : ''}, leaving ${usable.length}.`,
    caveated.length
      ? `${caveated.length} of the contributing metrics (${caveated.map((c) => c.id).join(', ')}) ${caveated.length === 1 ? 'carries' : 'carry'} a documented weakness in the sex reference — see the caveat on the contribution.`
      : '',
    `This is a descriptive projection onto published sex differences, not a validated instrument and not a ranking. There is no cut-point on the axis and no direction on it that is better than the other${sex ? `, including for a face reported as ${sex}` : ''}.`,
  ].filter(Boolean).join(' ');

  return { score, direction, contributions, confidence, note };
}

/** Both composites in one object, shaped for a caller that is about to render
 *  them side by side.
 *
 *  Accepts the frontal-metrics result directly, since that is what the caller
 *  already holds, and falls back to an explicit `{ points, metrics, sex }` bag
 *  so this module stays testable without running a detection. */
export function summariseComposites(frontResult, sex, opts = {}) {
  const src = frontResult || {};
  const points = (src.aligned && src.aligned.P) || src.points || null;
  const metrics = src.metrics || null;
  const subjectSex = sex || src.sex || null;

  const av = averageness(points, opts.averageness);
  const dm = dimorphism(metrics, subjectSex, opts.dimorphism);

  return {
    averageness: av,
    dimorphism: dm,
    sex: subjectSex,
    // Neither composite has a reference population that would make a verdict
    // meaningful, so neither gets the typical/slightly-off/well-outside
    // treatment the scored measurements get. Render them as figures.
    scored: false,
    basis: `Averageness: ${av.meta.basis} Dimorphism: ${dm.confidence.label}`,
    caveats: [
      `The averageness reference is ${av.meta.n} portraits, not a population, and the figure is not a measure of attractiveness.`,
      'The dimorphism axis is a projection onto published sex differences. It is not validated, not a ranking, and carries no better or worse direction.',
      'Both are computed against the same anthropometric literature as the rest of the report, which is predominantly North American and European in origin.',
    ],
  };
}
