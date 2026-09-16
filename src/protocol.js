// What can actually be done about a finding.
//
// The commercial version of this feature is a personalised protocol: named
// products, prices, and a month-by-month schedule. None of that follows from a
// photograph. A brand and a price printed next to a landmark measurement is a
// fabrication wearing the costume of a plan, and it is the precise failure this
// tool exists to avoid. So this module maps each finding to the CATEGORY of
// intervention that would move it, states what the evidence for that category
// actually shows, says whether the change can be undone, and gives a rough
// timescale. It names no product, no brand, no clinic, no price, and no month.
//
// Two rules govern the catalogue:
//
//   A metric with no entry here is one where nothing is known to move it, or
//   where there is nothing to move. Silence is a finding, not an oversight.
//
//   An entry marked `unscored` documents what would move the metric but is
//   never emitted by buildProtocol, because the tool refuses to score that
//   measurement. Recommending an intervention on the strength of a number the
//   report itself declines to judge would be incoherent. The entries exist so
//   the negative is written down where people go looking for it.
//
// The mutability vocabulary (grooming / posture / softTissue / ortho /
// surgical / fixed) lives in norms.js and is carried through on the row. It
// answers "what class of thing would have to change". This module answers the
// next question — what specifically, on what evidence, and at what cost in
// permanence — and the two are meant to be read together.

import { MUTABILITY } from './norms.js';

/** How good the evidence is for a given option doing what it claims.
 *
 *  The ranks order the vocabulary from strongest to weakest, and are used for
 *  sorting only. `contested` and `none` are deliberately distinct: "people
 *  looked and it did not hold up" and "nobody has looked" are different states
 *  of knowledge, and collapsing them into a single hedge loses the more useful
 *  half every time. */
export const EVIDENCE_GRADES = {
  rct: {
    rank: 1, label: 'Randomised controlled trial',
    hint: 'At least one randomised trial with a control arm measured the outcome being claimed.',
  },
  trial: {
    rank: 2, label: 'Trial without a control arm',
    hint: 'Prospective or before-and-after study, sometimes with blinded raters, but nothing to compare against. Regression to the mean and expectation effects are not excluded.',
  },
  observational: {
    rank: 3, label: 'Observational association',
    hint: 'Cohort, cross-sectional or twin data linking an exposure to an outcome. Not an intervention study, so the effect of changing the exposure is inferred rather than measured.',
  },
  consensus: {
    rank: 4, label: 'Case series and clinical consensus',
    hint: 'What surgeons report and teach. Reliable about what an operation does to the anatomy, and silent on how the result compares with leaving it alone.',
  },
  mechanism: {
    rank: 5, label: 'Mechanism only',
    hint: 'The physiology is plausible, or the effect on the measurement is arithmetic, but the outcome itself has not been measured.',
  },
  contested: {
    rank: 6, label: 'Tested; did not hold up',
    hint: 'Studies exist and they do not support the claim, or support something far smaller than the claim.',
  },
  none: {
    rank: 7, label: 'No evidence located',
    hint: 'Searched for and not found. That is not the same as disproved, and it is not a reason to do it.',
  },
};

// Kinds, ordered by what they cost you: effort, then money, then permanence.
// This ordering is the whole basis for the protocol sort, so that the free and
// reversible options are read before anything that involves a needle or a
// knife. It is an editorial judgement about cost, not a claim about efficacy.
const KIND_ORDER = ['behavioural', 'grooming', 'topical', 'injectable', 'orthodontic', 'surgical', 'none'];
const kindRank = (k) => {
  const i = KIND_ORDER.indexOf(k);
  return i < 0 ? KIND_ORDER.length : i;
};

// true < 'partial' < false. An option you can walk back from is cheaper than
// one you cannot, whatever it costs in money.
const REVERSIBILITY_RANK = { true: 0, partial: 1, false: 2 };
const revRank = (r) => REVERSIBILITY_RANK[String(r)] ?? 2;

/** Evidence record. `source` is a real citation or null; when it is null the
 *  note must say what was searched for and not found, because an unsourced
 *  claim presented without that admission is indistinguishable from an
 *  invented one. */
const ev = (grade, source, note) => ({ grade, source: source || null, note: note || null });

/** Rough time from starting to seeing the change — NOT how long the change
 *  lasts. The two diverge badly for injectables, where the effect arrives in a
 *  fortnight and leaves within the year, so durability is stated in `caveat`
 *  instead of being smuggled into this field. */
const span = (lo, hi, unit) => ({
  lo, hi, unit, label: lo === hi ? `${lo} ${unit}` : `${lo}–${hi} ${unit}`,
});
const SAME_DAY = { lo: 0, hi: 0, unit: 'days', label: 'same day' };

function deepFreeze(o) {
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return Object.freeze(o);
}

// ---------------------------------------------------------------------------
// Shared options.
//
// These are the things promoted hardest and evidenced least, and each of them
// is claimed for several different measurements. They are written once and
// referenced from every metric they are sold against, so that the answer is
// the same wherever the reader meets it.
// ---------------------------------------------------------------------------

const MEWING = {
  kind: 'behavioural',
  what: 'Holding the tongue flat against the palate at rest — "mewing" — is promoted as a way to widen the maxilla, raise the cheekbones and sharpen the jaw without surgery.',
  evidence: ev('none', null,
    'Searched and not found: PubMed returns no clinical study of the mewing claim at all, and the systematic review sometimes cited for it could not be located there. What is established is anatomical rather than experimental — the midpalatal suture is typically fused by the mid-twenties, so in an adult there is no longer a joint for tongue pressure to act on. Palatal-expansion figures quoted in support come from growing patients and from appliances, not from posture.'),
  reversible: true,
  timescale: null,
  caveat: 'Habitual nasal breathing and a closed-lip resting posture are worth having for their own reasons. Neither is the same claim as remodelling a face, and neither shows up in these measurements.',
};

const FACIAL_EXERCISE = {
  kind: 'behavioural',
  what: 'Repeated resistance exercises for the facial muscles ("face yoga"), claimed to lift and firm the overlying soft tissue.',
  evidence: ev('contested', 'Alam et al., JAMA Dermatol 2018;154(3):365–367',
    'Graded on what it did NOT show. The one trial with blinded raters ran 20 weeks in middle-aged women and found change in upper and lower cheek fullness, with estimated age falling from about 51 to about 49 — but it had sixteen completers, no control group and unblinded participants, and of nineteen rated features only the cheeks moved. It is evidence for cheek fullness in that population. Every metric it is listed against here is one of the seventeen features that did not move.'),
  reversible: true,
  timescale: span(12, 20, 'weeks'),
  caveat: 'The measured effect was on fullness, not on any angle, ratio or landmark distance this tool computes.',
};

const GUA_SHA = {
  kind: 'behavioural',
  what: 'Facial massage with a stone or roller, marketed as lymphatic drainage that sculpts the contour.',
  evidence: ev('trial', 'Ahn et al., J Cosmet Dermatol 2025 (randomised, 34 women, 8 weeks); reviewed in Hamp et al., J Cosmet Dermatol 2023',
    'A small randomised trial measured facial surface-distance reductions of roughly 2.2–2.4mm, in the same range as manual lymphatic drainage. That is a fluid shift, and it behaves like one: it is transient and it returns. The 2023 review found the overall evidence insufficient, with small samples, short durations and weak controls. Nothing in it supports change to fat, fascia or bone, which is what "sculpting" is made to sound like.'),
  reversible: true,
  timescale: SAME_DAY,
  caveat: 'A millimetre or two of transient de-puffing is a real effect and a small one. Measure it against yourself on the same morning, not against a population.',
};

const CHEWING = {
  kind: 'behavioural',
  what: 'Hard gum or a jaw-training device, chewed to build the masseter and define the jawline.',
  evidence: ev('contested', '“Effects of gum chewing exercise on maximum bite force according to facial morphology”, 2018 (PMC5893462); American Dental Association position on chewing and face shape',
    'Chewing training does increase bite force and masseter thickness — that part is real. The aesthetic claim does not follow from it: a bigger masseter makes the lower face WIDER, which is the opposite of the taper most people are chewing for, and the studies that looked for a change in facial shape did not find one. Masseter hypertrophy is what botulinum toxin is injected to reverse.'),
  reversible: true,
  timescale: span(2, 6, 'months'),
  caveat: 'If the jaw-width number is already high, this moves it further in the direction you did not want. Excessive chewing also aggravates temporomandibular pain and bruxism.',
};

const SLEEP_POSITION = {
  kind: 'behavioural',
  what: 'Sleeping on the back rather than the side or front, to keep the face off the pillow.',
  evidence: ev('observational', 'Anson, Kane & Lambros, “Sleep Wrinkles: Facial Aging and Facial Distortion During Sleep”, Aesthet Surg J 2016;36(8)',
    'A review arguing that compression, shear and tension during side and front sleeping produce a distinct class of wrinkle, different in pattern and cause from expression lines. It is a mechanistic argument supported by clinical observation, not a trial: no one has randomised people to a sleeping position for long enough to measure the outcome.'),
  reversible: true,
  timescale: span(1, 5, 'years'),
  caveat: 'The claimed effect is on skin creasing over years. It is not a mechanism for changing skeletal asymmetry, and the overnight puffiness it is often confused with resolves on its own within the hour.',
};

const SLEEP_DURATION = {
  kind: 'behavioural',
  what: 'Sleeping normally rather than short, for the swelling and colour around the eyes.',
  evidence: ev('rct', 'Axelsson et al., BMJ 2010;341:c6614; Sundelin et al., Sleep 2013',
    'Photographs taken after a normal night and after sleep deprivation, rated blind and in random order, showed hanging eyelids, swollen eyes, droopy mouth corners, darker under-eyes, redder eyes and paler skin. The eyelid and swelling effects were the largest; the colour effects were several times smaller. This is one of the few genuinely experimental results in this entire catalogue.'),
  reversible: true,
  timescale: span(1, 3, 'days'),
  caveat: 'This is the strongest reason to distrust a single photograph. If the shot was taken tired, the eye-aperture and under-eye numbers are measuring the night before, not the face.',
};

const WEIGHT_CHANGE = {
  kind: 'behavioural',
  what: 'Change in overall body-fat level, which the face tracks along with everything else.',
  evidence: ev('observational', 'Coetzee, Perrett & Stephen, “Facial Adiposity: A Cue to Health?”, Perception 2009 (doi 10.1068/p6423); later facial-adiposity reviews',
    'Perceived facial adiposity correlates strongly with BMI and body-fat percentage — observers estimate body composition from a face at around r = 0.7 — and predicts perceived health. These are associations measured across people, not a trial of losing weight and remeasuring the same face.'),
  reversible: true,
  timescale: span(3, 12, 'months'),
  caveat: 'Fat is not lost by region on request. There is no way to direct it away from the face, and below a certain point the face loses volume it was using.',
};

const POSTURE_AND_PHOTO = {
  kind: 'behavioural',
  what: 'Re-shooting with the camera at eye level, two metres back, chin neutral and neck long.',
  evidence: ev('mechanism', 'Quality gate in metrics-front.js; pitch, yaw and focal-length sensitivity documented on the Method page',
    'Not an intervention on the face at all. Chin position, camera height and lens distance move the jaw, neck and vertical proportion measurements by more than most anatomy does, which is why this belongs at the top of any list before anyone considers a needle.'),
  reversible: true,
  timescale: SAME_DAY,
  caveat: 'Rule this out first. A number that changes when you retake the photograph was never a finding about your face.',
};

const SMOKING_AND_SUN = {
  kind: 'behavioural',
  what: 'Not smoking, and routine sun protection, for the soft-tissue changes that accumulate over decades.',
  evidence: ev('observational', 'Okada et al., Plast Reconstr Surg 2013 (identical twins discordant for smoking)',
    'In twin pairs discordant for smoking, the smoking twin scored worse for under-eye bags, cheek and jowl laxity and perioral lines, and was judged older in a clear majority of pairs. Observational throughout, with the usual confounding, but the effect is large and consistent. Sun exposure is bundled in here on the strength of the photoageing literature generally rather than on any single paper read for this entry.'),
  reversible: 'partial',
  timescale: span(5, 20, 'years'),
  caveat: 'This prevents change rather than reversing it. Damage already present does not go back.',
};

/** Rhinoplasty moves every nasal angle in this report; the entry differs only
 *  in which angle and how. Written as a factory so each metric can say what
 *  the operation does to its own number without four copies of the caveats. */
const rhinoplasty = (what) => ({
  kind: 'surgical',
  what,
  evidence: ev('consensus', 'Powell & Humphreys, Proportions of the Aesthetic Face (1984), and the standard rhinoplasty planning literature',
    'These angles ARE the planning targets, so the evidence that surgery moves them is the operation itself, documented across decades of case series. What no series establishes is the step people assume: that moving one of these numbers toward a published mean makes a particular face look better.'),
  reversible: false,
  timescale: span(6, 12, 'months'),
  caveat: 'Swelling takes six to twelve months to settle, tip swelling longest, and the result is not final before then.',
});

/** Jaw position is skeletal. Orthodontics tips teeth and can camouflage a
 *  discrepancy; only surgery moves the bone the soft tissue sits on. */
const ORTHOGNATHIC = {
  kind: 'surgical',
  what: 'Orthognathic surgery — repositioning the maxilla, the mandible or both, usually with orthodontics before and after.',
  evidence: ev('consensus', 'Perceived effects of orthognathic surgery versus orthodontic camouflage, J Clin Med 2024;13(1):91; cephalometric soft-tissue change series',
    'Surgery produces substantially larger skeletal and profile change than orthodontic camouflage: raters scored profile improvement in the region of 14–18% after combined treatment against only minor change after orthodontics alone. The soft-tissue response to a given bony movement is predictable in aggregate and variable in the individual.'),
  reversible: false,
  timescale: span(18, 36, 'months'),
  caveat: 'A major operation with a long orthodontic tail, a real complication profile including lasting lip and chin numbness, and outcomes that are sometimes funded as functional treatment and sometimes not.',
};

const ORTHODONTIC_CAMOUFLAGE = {
  kind: 'orthodontic',
  what: 'Braces or aligners, moving teeth to compensate for a jaw relationship rather than to change it.',
  evidence: ev('consensus', 'Class II and Class III camouflage series; “Soft-tissue modification in Class III non-growing patients treated with clear aligners: a prospective clinical trial”, 2025 (PMC12069331)',
    'Incisor position moves the lips reliably, which is why extraction and retraction decisions are argued about in terms of profile. The effect on the underlying facial angles is modest and bounded by how far roots can move through alveolar bone.'),
  reversible: 'partial',
  timescale: span(12, 30, 'months'),
  caveat: 'Bounded by biology: pushed past the alveolar envelope this causes recession and root resorption, which is why the limits are argued about rather than ignored.',
};

const HA_FILLER_NOTE = 'Hyaluronic acid is the one injectable that is genuinely reversible — hyaluronidase dissolves it — which is why it is graded differently from fat grafting or a permanent implant. The serious complication is vascular occlusion; published case reviews put the nose and glabella at the top of the risk list for filler-induced blindness.';

// ---------------------------------------------------------------------------
// The catalogue, keyed by metric id. Ids match NORMS and PROFILE_NORMS.
// ---------------------------------------------------------------------------

export const INTERVENTIONS = deepFreeze({
  // ---------- vertical proportion ----------
  lowerThirdRatio: {
    summary: 'How the lower third splits between nose-to-lips and lips-to-chin is set by jaw position and chin height.',
    options: [
      MEWING,
      {
        kind: 'surgical',
        what: 'Genioplasty or orthognathic surgery changes chin height directly, and with it the split.',
        evidence: ev('consensus', 'Standard orthognathic planning; soft-tissue response ratios from cephalometric series',
          'Vertical chin height is routinely reduced or increased at surgery. The literature is case series and planning convention, not comparative trials.'),
        reversible: false,
        timescale: span(6, 12, 'months'),
        caveat: 'The canon this is scored against circulates in two incompatible forms and measured faces sit near the lower one. Operating toward a number that is itself contested is a poor reason to operate.',
      },
    ],
  },

  // ---------- eyes and brows ----------
  canthalTilt: {
    summary: 'The angle between the eye corners is set by where the lateral canthal tendon attaches to the orbital rim, and it drifts downward with age as that tendon loosens.',
    options: [
      {
        kind: 'injectable',
        what: 'Barbed PDO "fox eye" thread lifts, sold as a no-downtime way to raise the outer corner.',
        evidence: ev('none', null,
          'Searched and not found: no controlled trial of thread lifts for canthal tilt was located. The mechanism does not support the claim either — threads placed in the temporal soft tissue pull on skin above the brow, while canthal tilt is fixed by a tendon anchored to bone, so the measured angle is not the thing being moved. Threads dissolve within roughly six to twelve months.'),
        reversible: 'partial',
        timescale: SAME_DAY,
        caveat: 'What lifts on the day is soft tissue above the eye. That can change how the eye reads without changing the landmark angle this tool measures.',
      },
      {
        kind: 'surgical',
        what: 'Lateral canthopexy tightens and repositions the tendon; canthoplasty divides and reattaches it, and is the operation capable of genuine repositioning.',
        evidence: ev('consensus', 'Oculoplastic and lower-lid reconstruction literature; canthoplasty technique reviews',
          'These are established functional operations for lid malposition, repurposed cosmetically. The evidence base is technique series from lid surgery rather than trials of aesthetic outcome.'),
        reversible: false,
        timescale: span(3, 6, 'months'),
        caveat: 'The vector is unforgiving — too anterior and the lid stands off the eye, too superior and the aperture narrows. Dry eye, lid malposition, visible asymmetry and an altered eye shape are the recognised complications, and they are not always correctable.',
      },
    ],
  },

  intercanthalMm: {
    summary: 'The distance between the inner eye corners is set by the medial canthal tendons and the bone between the orbits.',
    options: [
      {
        kind: 'grooming',
        what: 'Makeup, brow shaping and lens choice change how wide-set the eyes look.',
        evidence: ev('mechanism', null,
          'No source, and none needed for the mechanism — but note carefully what it does not do. This tool measures landmark positions, not the impression a face makes. Nothing in this row will move, whatever the mirror says.'),
        apparentOnly: true,
        reversible: true,
        timescale: SAME_DAY,
        caveat: 'Changes appearance, not the measurement. Worth knowing which one you actually care about.',
      },
      {
        kind: 'none',
        what: 'Nothing else moves it. Medial canthopexy exists, but it is done for traumatic telecanthus and craniofacial anomaly, not for a number two millimetres off a reference mean.',
        evidence: ev('mechanism', 'Farkas reference ranges, in norms.js',
          'Clinically, only the extremes mean anything: roughly above 37mm is telecanthus and below 27mm hypotelorism. Inside those bounds it carries no weight and has no intervention attached to it.'),
        reversible: false,
        timescale: null,
        caveat: null,
      },
    ],
  },

  pfhMm: {
    unscored: true,
    summary: 'The vertical opening of the eye is mostly expression, lid position and overnight fluid on the day of the photograph.',
    options: [SLEEP_DURATION, SLEEP_POSITION, GUA_SHA],
  },

  browApexPos: {
    summary: 'Where the brow peaks is set by where the brow is groomed to, and secondarily by the balance between the muscles that lift and depress it.',
    options: [
      {
        kind: 'grooming',
        what: 'Shaping — plucking, waxing, threading, or drawing the tail in — moves the apex directly, because the apex is measured to the visible brow edge.',
        evidence: ev('mechanism', null,
          'No trial exists and none is required: the measurement is taken to the topmost brow landmark, so changing where the brow ends changes it arithmetically. Cited as mechanism rather than efficacy so it is not mistaken for a treatment claim.'),
        reversible: 'partial',
        timescale: SAME_DAY,
        caveat: 'Hair regrows over weeks, but repeatedly plucking the same follicles for years causes permanent thinning. The reversibility is real in the short term and not in the long one.',
      },
      {
        kind: 'grooming',
        what: 'Cosmetic tattooing — microblading and similar — redraws the apex semi-permanently.',
        evidence: ev('consensus', 'Cosmetic tattooing practice literature',
          'Well described procedurally. Outcome quality depends on the practitioner far more than on the technique, and there is no useful comparative evidence.'),
        reversible: 'partial',
        timescale: span(1, 3, 'years'),
        caveat: 'Fades over years rather than washing off, and pigment removal is slow, incomplete and its own procedure.',
      },
      {
        kind: 'injectable',
        what: 'Botulinum toxin to the lateral brow depressors raises the outer brow and shifts the peak laterally.',
        evidence: ev('trial', 'Huilgol, Carruthers & Carruthers, “Raising eyebrows with botulinum toxin”, Dermatol Surg 1999 (PMID 10469075); Ahn, Catten & Maas, “Temporal brow lift using botulinum toxin A”, Plast Reconstr Surg 2000 (PMID 10724275)',
          'Published series report elevation of roughly a millimetre at the mid-pupil and up to about five millimetres at the lateral canthus, varying with injection site and with where the brow is measured from. Small, real, and heavily technique-dependent.'),
        reversible: true,
        timescale: span(1, 2, 'weeks'),
        caveat: 'Wears off in three to four months. Overdone laterally it produces the peaked "Spock" brow, which is the same mechanism with too much of it.',
      },
    ],
  },

  browEyeMm: {
    summary: 'Brow-to-lid distance is grooming, muscle balance and lid skin laxity, in that order of how easily each moves.',
    options: [
      {
        kind: 'grooming',
        what: 'Where the lower brow border is plucked or drawn sets this number, and changes it the same day.',
        evidence: ev('mechanism', null,
          'No trial, and the claim is not really about efficacy: the tool measures from the upper lid margin to the lower edge of the brow as drawn, so the brow edge is the measurement.'),
        reversible: 'partial',
        timescale: SAME_DAY,
        caveat: 'Regrowth takes weeks; decades of plucking the same line does not grow back.',
      },
      {
        kind: 'injectable',
        what: 'Botulinum toxin to the glabellar complex and lateral orbicularis, the brow depressors, lets the frontalis sit the brow higher.',
        evidence: ev('trial', 'Huilgol, Carruthers & Carruthers, Dermatol Surg 1999;25(5):373–376; Ahn, Catten & Maas, Plast Reconstr Surg 2000;105(3):1129–1135',
          'A few millimetres at most, and the figure depends on where along the brow it is measured — roughly 1mm at the mid-pupil against up to about 5mm at the lateral canthus in the most-quoted series.'),
        reversible: true,
        timescale: span(1, 2, 'weeks'),
        caveat: 'Three to four months per treatment. Injected into the frontalis instead of the depressors it does the opposite and drops the brow.',
      },
      FACIAL_EXERCISE,
      {
        kind: 'surgical',
        what: 'Brow lift — endoscopic, temporal or direct — repositions the brow on the forehead.',
        evidence: ev('consensus', 'Brow lift technique series; comparative outcome data between approaches is weak',
          'Long-lasting and well described. Which approach is best for whom is decided by surgeon preference more than by evidence.'),
        reversible: false,
        timescale: span(3, 6, 'months'),
        caveat: 'A raised brow that was never low reads as surprise. This is one of the operations where overcorrection is more visible than the original finding.',
      },
    ],
  },

  // ---------- mouth ----------
  vermilionRatio: {
    summary: 'The balance between upper and lower lip height is soft tissue, and it is the most straightforwardly addressable measurement in this report.',
    options: [
      {
        kind: 'topical',
        what: 'Irritant "plumping" glosses — capsaicin, cinnamon, menthol.',
        evidence: ev('mechanism', null,
          'No controlled trial located. The mechanism is irritant vasodilation and mild oedema — swelling rather than volume, resolving within the hour. Listed as a confound rather than an option: what it changes is the photograph.'),
        apparentOnly: true,
        reversible: true,
        timescale: SAME_DAY,
        caveat: 'If the photograph was taken after using one, this number is measuring the gloss and not the lip.',
      },
      {
        kind: 'injectable',
        what: 'Hyaluronic acid filler, placed to correct the ratio rather than to add volume everywhere.',
        evidence: ev('rct', 'Multiple randomised, evaluator-blinded pivotal trials, including a 48-week study in Dermatol Surg 2021 and a four-filler quadruple-blind head-to-head in J Am Acad Dermatol 2022, pooled in a 2021 meta-analysis of HA lip augmentation',
          'One of the few things in this catalogue with proper randomised evidence. On blinded-evaluator scoring the 48-week trial put responders near 88% at eight weeks and about 60% at forty-eight, and the meta-analysis put twelve-month response nearer 46%. Unblinded investigator and subject ratings from the same trial run far higher, around 96–98% at eight weeks — the gap between the blinded and unblinded figure is itself worth knowing, and so is the decline.'),
        reversible: true,
        timescale: span(2, 4, 'weeks'),
        caveat: HA_FILLER_NOTE,
      },
      {
        kind: 'behavioural',
        what: 'Lip exercises and suction "plumping" devices.',
        evidence: ev('none', null,
          'Searched and not found: no controlled trial of either for lip proportion was located. Suction produces transient oedema, which photographs like volume and is not volume.'),
        reversible: true,
        timescale: null,
        caveat: 'Suction devices bruise, and repeated use has been reported to cause lasting marks.',
      },
    ],
  },

  vermilionOverLower3: {
    summary: 'Total lip height as a share of the lower face falls with age as the vermilion thins and the philtrum lengthens.',
    options: [
      SMOKING_AND_SUN,
      {
        kind: 'injectable',
        what: 'Hyaluronic acid filler increases vermilion show.',
        evidence: ev('rct', 'Randomised evaluator-blinded lip-augmentation trials, as above',
          'Same trial base as the upper-to-lower ratio. It adds height as well as projection, so it moves this number too.'),
        reversible: true,
        timescale: span(2, 4, 'weeks'),
        caveat: HA_FILLER_NOTE,
      },
      FACIAL_EXERCISE,
      {
        kind: 'surgical',
        what: 'Subnasal lip lift shortens the cutaneous upper lip and increases vermilion show without adding material.',
        evidence: ev('consensus', 'Lip lift technique series',
          'Descriptive case series. The trade-off — a scar under the nose against a permanent change in show — is documented; comparative evidence against filler is not.'),
        reversible: false,
        timescale: span(1, 3, 'months'),
        caveat: 'Permanent, and the scar is at the nasal base where it is visible in exactly the kind of photograph this tool analyses.',
      },
    ],
  },

  philtrumMm: {
    summary: 'Philtrum length is set by the anatomy between nose and lip, and lengthens with age. Nothing reversible shortens it.',
    options: [
      {
        kind: 'injectable',
        what: 'Filler in the upper lip does not shorten the philtrum; by increasing vermilion show it can make the cutaneous portion read shorter.',
        evidence: ev('mechanism', null,
          'No source located for a measured reduction in philtrum length from filler, because the landmark it is measured to does not move. Listed to head off the substitution — appearing shorter and being shorter are different claims, and this tool measures the second.'),
        apparentOnly: true,
        reversible: true,
        timescale: span(2, 4, 'weeks'),
        caveat: HA_FILLER_NOTE,
      },
      {
        kind: 'surgical',
        what: 'Subnasal lip lift excises a strip of skin at the nasal base and genuinely shortens the philtrum.',
        evidence: ev('consensus', 'Lip lift technique series',
          'The measurement moves because tissue is removed. Well described procedurally; no comparative outcome evidence.'),
        reversible: false,
        timescale: span(1, 3, 'months'),
        caveat: 'Irreversible, and over-shortening is difficult to correct. The reference means here are also narrow — roughly 15.8mm in men and 14.0mm in women — so a value a couple of millimetres out is inside ordinary variation.',
      },
    ],
  },

  philtrumOverChin: {
    summary: 'Philtrum length against chin height. The denominator is skeletal, so the ratio mostly reports chin height.',
    options: [
      {
        kind: 'surgical',
        what: 'Genioplasty or a chin implant changes chin height and projection, and moves the ratio through the denominator.',
        evidence: ev('consensus', 'Chin augmentation and genioplasty series',
          'Established operations with predictable skeletal effect. Nothing establishes that this particular ratio is worth operating toward.'),
        reversible: false,
        timescale: span(3, 6, 'months'),
        caveat: 'Operating on the chin to fix a ratio driven by the philtrum is the wrong end of the problem.',
      },
    ],
  },

  // ---------- jaw ----------
  bigonialOverBizygo: {
    unscored: true,
    summary: 'How much the face tapers from cheekbone to jaw. Masseter bulk raises it, body-fat gain flattens the taper, and the photographic silhouette measures neither cleanly.',
    options: [
      WEIGHT_CHANGE,
      CHEWING,
      MEWING,
      {
        kind: 'injectable',
        what: 'Botulinum toxin into the masseter reduces muscle bulk and narrows the lower face.',
        evidence: ev('rct', 'Randomised, double-blind, placebo-controlled dose-finding study, Dermatol Surg 2021 (PMID 33347002); randomised triple-blinded trial, Sci Rep 2024 (s41598-024-65395-5); phase 2 randomised study of onabotulinumtoxinA, J Am Acad Dermatol 2024',
          'Genuinely well evidenced for masseter reduction, with randomised and placebo-controlled trials. Maximum effect at roughly three months; duration commonly six to twelve months, with about half of patients retreating between four and seven months.'),
        reversible: true,
        timescale: span(2, 3, 'months'),
        caveat: 'Wears off, and maintaining the result means repeating it indefinitely. Prolonged use can reduce bite force and has been reported to affect the bone the muscle pulls on.',
      },
    ],
  },

  jawAngleSharpness: {
    unscored: true,
    summary: 'How sharply the frontal silhouette turns at the jaw angle. Submental and jowl fat soften it; bone sets the limit.',
    options: [WEIGHT_CHANGE, POSTURE_AND_PHOTO, FACIAL_EXERCISE, CHEWING],
  },

  // ---------- symmetry ----------
  symmetryRms: {
    unscored: true,
    summary: 'Left-right mismatch. Dominated by head yaw in the photograph, and after that by anatomy that has been asymmetric since growth.',
    options: [
      POSTURE_AND_PHOTO,
      SLEEP_POSITION,
      {
        kind: 'none',
        what: 'Nothing reliably reduces skeletal facial asymmetry short of surgery, and almost everything marketed for it is marketed against a measurement that was mostly head position.',
        evidence: ev('mechanism', 'Chu, Farrag, Ishii & Byrne, “Threshold of visual perception of facial asymmetry in a facial paralysis model”, Arch Facial Plast Surg 2011;13(1):14–19 (PMID 21242426)',
          'Observers generally cannot detect asymmetry below about 3mm, and everyone is asymmetric. Under roughly 3° of yaw this measurement is an upper bound rather than a finding, which is why it is not scored.'),
        reversible: false,
        timescale: null,
        caveat: 'A marked, progressive or new asymmetry is a clinical question — nerve, joint or growth — and not a cosmetic one. That is a reason to see a doctor, not to buy anything.',
      },
    ],
  },

  // ---------- profile: nose ----------
  nasofrontal: {
    summary: 'The depth of the nasal root, between brow and dorsum.',
    options: [
      {
        kind: 'injectable',
        what: 'Filler at the radix deepens or shallows the transition without surgery.',
        evidence: ev('consensus', 'Non-surgical rhinoplasty case series; Beleznay et al., Dermatol Surg 2015 (98 published cases of filler blindness) and the 2024 update in Aesthet Surg J',
          'Effective and short-lived, on case-series evidence only. The safety data is the part worth reading: the nasal region and glabella are consistently at the top of the list of sites causing filler-induced blindness, and most reported vision loss did not recover.'),
        reversible: true,
        timescale: SAME_DAY,
        caveat: 'The highest-risk injection territory on the face. Reversible in the sense that the filler dissolves; the vascular complication is not reversible at all.',
      },
      rhinoplasty('Dorsal and radix work changes the nasofrontal angle directly.'),
    ],
  },

  nasolabial: {
    summary: 'Tip rotation — the most-quoted number in rhinoplasty planning.',
    options: [
      {
        kind: 'behavioural',
        what: '"Nose exercises" and nose-shaping clips, promoted for narrowing or lifting the tip.',
        evidence: ev('none', null,
          'Searched and not found: no clinical study of nasal exercise or clip devices for nasal shape was located. The nose below the bony vault is cartilage and skin, and there is no muscle there whose training would reshape it.'),
        reversible: true,
        timescale: null,
        caveat: 'Clips left on long enough to leave a mark are leaving a pressure mark, not a shape.',
      },
      {
        kind: 'injectable',
        what: 'Filler at the columellar base can rotate the tip upward slightly and camouflage a dorsal hump.',
        evidence: ev('consensus', 'Non-surgical rhinoplasty series; Beleznay et al., Dermatol Surg 2015',
          'Case-series evidence for the aesthetic effect. It adds volume, so it can raise a profile but cannot reduce one.'),
        reversible: true,
        timescale: SAME_DAY,
        caveat: 'Same vascular risk as any nasal injection, and the nose is the worst site for it in the published case reviews.',
      },
      rhinoplasty('Tip rotation is a routine target of rhinoplasty and the nasolabial angle is how it is planned and measured.'),
    ],
  },

  nasofacial: {
    summary: 'Nasal projection relative to the face as a whole.',
    options: [rhinoplasty('Reducing or augmenting dorsal projection moves this angle; so, indirectly, does changing chin projection.')],
  },

  nasomental: {
    summary: 'Nose against chin. The two trade off, which is why a chin is so often proposed for a nose complaint.',
    options: [
      {
        kind: 'injectable',
        what: 'Filler to the chin increases projection and rebalances the nose-to-chin relationship without touching the nose.',
        evidence: ev('consensus', 'Chin augmentation filler series',
          'Case-series evidence. The underlying observation — that the two projections are judged against each other rather than separately — is old and well supported in planning practice.'),
        reversible: true,
        timescale: SAME_DAY,
        caveat: HA_FILLER_NOTE,
      },
      {
        kind: 'surgical',
        what: 'Chin implant or sliding genioplasty, as an alternative to operating on the nose.',
        evidence: ev('consensus', 'Chin augmentation and genioplasty series',
          'Long-established. Which of the two projections to change is a judgement, not a finding this measurement can make.'),
        reversible: false,
        timescale: span(3, 6, 'months'),
        caveat: 'Implants can migrate and can cause bone resorption underneath them; genioplasty moves the patient’s own bone and carries a nerve-injury risk instead.',
      },
      rhinoplasty('Reducing nasal projection moves the same angle from the other end.'),
    ],
  },

  goodeRatio: {
    summary: 'Nasal projection, measured from the alar crease.',
    options: [rhinoplasty('Tip projection is set or reduced at surgery, and Goode’s ratio is one of the ways it is planned.')],
  },

  // ---------- profile: balance ----------
  facialConvexity: {
    summary: 'The glabella-subnasale-pogonion angle describes how the middle of the face sits against its ends. It is a jaw-relationship measurement.',
    options: [
      MEWING,
      {
        kind: 'injectable',
        what: 'Chin filler changes the profile silhouette without moving the skeleton behind it.',
        evidence: ev('consensus', 'Chin augmentation filler series',
          'Camouflage, and honest about being camouflage: the soft-tissue pogonion moves forward, the mandible does not.'),
        reversible: true,
        timescale: SAME_DAY,
        caveat: HA_FILLER_NOTE,
      },
      ORTHODONTIC_CAMOUFLAGE,
      ORTHOGNATHIC,
    ],
  },

  mentolabial: {
    summary: 'The depth of the crease between lower lip and chin, driven by incisor position and chin prominence.',
    options: [
      ORTHODONTIC_CAMOUFLAGE,
      {
        kind: 'injectable',
        what: 'Filler in the mentolabial sulcus softens a deep crease.',
        evidence: ev('consensus', 'Chin and pre-jowl augmentation series',
          'Case-series evidence for the local effect.'),
        reversible: true,
        timescale: SAME_DAY,
        caveat: 'The published standard deviations for this angle are very wide — roughly ±20° in men — so only a large deviation means anything, and most values are inside ordinary variation.',
      },
    ],
  },

  eLineUpper: {
    summary: 'Upper lip position against the nose-tip-to-chin line. Moves when the teeth behind it move.',
    options: [
      ORTHODONTIC_CAMOUFLAGE,
      {
        kind: 'injectable',
        what: 'Lip filler moves the lip forward relative to the line.',
        evidence: ev('rct', 'Randomised evaluator-blinded lip-augmentation trials, as under the lip metrics',
          'Good evidence that filler adds lip projection. No evidence that moving this particular ratio toward Ricketts’ target improves anything.'),
        reversible: true,
        timescale: span(2, 4, 'weeks'),
        caveat: HA_FILLER_NOTE,
      },
    ],
  },

  eLineLower: {
    summary: 'Lower lip against the same line.',
    options: [
      ORTHODONTIC_CAMOUFLAGE,
      {
        kind: 'injectable',
        what: 'Filler to the lower lip or the chin changes where the lip sits relative to the line — from either end of it.',
        evidence: ev('rct', 'Randomised evaluator-blinded lip-augmentation trials',
          'Note that the E-line is defined by nose tip and chin, so augmenting the chin moves the LINE rather than the lip. Both change the number and they are not the same intervention.'),
        reversible: true,
        timescale: span(2, 4, 'weeks'),
        caveat: HA_FILLER_NOTE,
      },
    ],
  },

  // ---------- profile: jaw and neck ----------
  gonialSoft: {
    summary: 'The soft-tissue jaw angle. Bone sets it; muscle and fat pad it. This is not the radiographic gonial angle and cannot be made into one.',
    options: [
      CHEWING,
      {
        kind: 'surgical',
        what: 'Mandibular angle implants, or angle reduction, or a sagittal split as part of orthognathic surgery.',
        evidence: ev('consensus', 'Mandibular angle augmentation and reduction series',
          'The bone is what it is until it is cut or built on. Case-series evidence throughout.'),
        reversible: false,
        timescale: span(6, 12, 'months'),
        caveat: 'Only a lateral cephalogram measures the real gonial angle. Operating on the basis of a photographic soft-tissue proxy is planning from the wrong measurement.',
      },
    ],
  },

  mandibularPlane: {
    summary: 'Mandibular border against Frankfort horizontal — the difference between a downward-rotated long face and a square short one. Genuinely diagnostic in orthodontics.',
    options: [
      MEWING,
      {
        kind: 'orthodontic',
        what: 'Vertical control during growth — functional appliances, headgear, later temporary skeletal anchorage — influences how the mandible rotates.',
        evidence: ev('consensus', 'Growth-modification and vertical-control literature; miniscrew-anchored intrusion series',
          'Real, and largely confined to growing patients. In an adult the growth has happened, and what remains is dental compensation and surgery.'),
        reversible: 'partial',
        timescale: span(12, 36, 'months'),
        caveat: 'Age-limited in a way most of this catalogue is not. Past growth, this option is mostly gone.',
      },
      ORTHOGNATHIC,
    ],
  },

  ramusMandibleRatio: {
    unscored: true,
    summary: 'Ramus against mandibular body. Constructed from tragion, which is a surface approximation of the condyle, and has no published norm measured this way.',
    options: [
      {
        kind: 'none',
        what: 'Nothing is recommended against this number, because the tool cannot score it and no reference exists for the way it is measured here.',
        evidence: ev('none', null,
          'No published norm for this soft-tissue construction was located; norms.js says as much. Listed so the silence is deliberate rather than an omission.'),
        reversible: false,
        timescale: null,
        caveat: null,
      },
    ],
  },

  mentocervical: {
    summary: 'The chin-and-neck relationship. Rises with submental fullness and with a retruded chin, and moves a long way with head position alone.',
    options: [
      POSTURE_AND_PHOTO,
      WEIGHT_CHANGE,
      GUA_SHA,
      {
        kind: 'injectable',
        what: 'Chin filler increases projection and closes the angle from the chin end.',
        evidence: ev('consensus', 'Chin augmentation filler series',
          'Case-series evidence. Treats the chin half of a measurement that has two halves.'),
        reversible: true,
        timescale: SAME_DAY,
        caveat: HA_FILLER_NOTE,
      },
    ],
  },

  submentalCervical: {
    summary: 'The cervicomental angle — under-chin line against the neck. The most posture-sensitive number in the report, and after posture, the most fat-sensitive.',
    options: [
      POSTURE_AND_PHOTO,
      WEIGHT_CHANGE,
      {
        kind: 'behavioural',
        what: 'Neck and chin exercises, chin tucks, and jaw-strap devices sold for a "double chin".',
        evidence: ev('none', null,
          'Searched and not found: no controlled trial of neck or chin exercise for submental fullness was located. The one facial-exercise trial with blinded raters measured cheek fullness and did not look at the submental region. Subcutaneous fat is not reduced by contracting the muscle beneath it, here or anywhere else on the body.'),
        reversible: true,
        timescale: null,
        caveat: 'Spot reduction does not work on the neck for the same reason it does not work on the abdomen.',
      },
      {
        kind: 'injectable',
        what: 'Deoxycholic acid injection destroys submental fat cells.',
        evidence: ev('rct', 'REFINE-1 and REFINE-2 phase 3 randomised placebo-controlled trials, J Am Acad Dermatol 2016; three-year follow-up, Aesthet Surg J 2021;41(11):NP1532',
          'The best-evidenced injectable in this catalogue after botulinum toxin. Composite improvement of one grade or more in 66.5% on treatment against 22.2% on placebo, and response maintained in most patients at three years.'),
        reversible: false,
        timescale: span(2, 6, 'months'),
        caveat: 'Destroys fat cells, so it is not undoable. Swelling after each session is substantial and the nerve running through the area can be temporarily injured, giving an asymmetric smile.',
      },
      {
        kind: 'surgical',
        what: 'Submental liposuction, or a neck lift where skin laxity rather than fat is the problem.',
        evidence: ev('consensus', 'Cervicofacial contouring series; Ellenbogen & Karlin, Plast Reconstr Surg 1980;66(6):826–837 for the criteria being aimed at',
          'Established and well described. Which of fat, platysma, skin or chin position is responsible is a clinical examination, not a photographic measurement.'),
        reversible: false,
        timescale: span(3, 6, 'months'),
        caveat: 'Removing fat from a neck whose problem is skin laxity or a retruded chin makes it look worse. This is the clearest case in the report where a number does not identify its own cause.',
      },
    ],
  },
});

/** The standing caveat. Render this with the protocol, every time, not behind
 *  a disclosure — the whole point of the module is that the mapping and its
 *  limits are read together. */
export const PROTOCOL_CAVEAT = deepFreeze({
  heading: 'What this is, and what it is not',
  body: [
    'This is a map from measurements to categories of intervention. For each finding it names the kind of thing that would move the number, what the evidence for that category actually shows, whether the change can be undone, and roughly how long it takes to appear. It names no product, no brand, no clinic and no price, and it sets out no schedule, because none of those follow from a photograph.',
    'It is not medical advice. Nothing here is a diagnosis, a prescription or a treatment plan. A measurement sitting outside a reference range is not by itself a reason to do anything about it: most of these bands are met by a minority of ordinary faces, and several of the references were written from samples that may look nothing like you.',
    'Nothing here substitutes for a clinician who has examined the face. A photograph cannot see bone, skin quality, lid laxity, occlusion, airway, or the history that decides whether any of this is appropriate or safe. Where a procedure is listed, the listing describes what that procedure does — not that you should have it, and not that you are a candidate for it.',
  ],
});

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const OUTSIDE = { slight: 1, notable: 2 };

/** Accepts either the grouped output of buildRows/buildProfileRows or a flat
 *  array of items, because the caller has both shapes and should not have to
 *  flatten them to ask this question. */
function flattenRows(rows) {
  const out = [];
  for (const r of rows || []) {
    if (!r) continue;
    if (Array.isArray(r.items)) {
      for (const it of r.items) if (it) out.push(it);
    } else if (r.id) {
      out.push(r);
    }
  }
  return out;
}

/** An option counts as supported if someone has looked and found something.
 *  Options graded `contested` or `none` still appear — saying "this is the one
 *  everybody sells and it does not work" is the most useful line in some
 *  entries — but they never lead a finding, because a free intervention that
 *  does nothing is not a reason to read that finding first. */
const isSupported = (o) => o.evidence.grade !== 'contested' && o.evidence.grade !== 'none';

/** An option only counts as action on the measurement if it moves the
 *  measurement. `apparentOnly` options change how a face reads to an observer
 *  and leave every landmark where it was; this tool measures the landmarks, so
 *  they are shown and never counted. */
const counts = (o) => o.kind !== 'none' && o.apparentOnly !== true;

/** Whether there is no way back from it. Kept as a hard binary. It is the
 *  FIRST key of the finding sort, so no finding led by something irreversible
 *  is ever listed above one that is not. Within a single finding it is the
 *  second key, after the supported-and-counts split — so an option that is
 *  reversible but graded contested/none, or that only changes appearances,
 *  does sink below an irreversible one that actually works. That is
 *  deliberate; it is not a promise that order is reversibility-first. Cost
 *  orders within each of the two groups: 'partial' — a brow that regrows for
 *  years and then stops — is not the same as a cut, and should not be pushed
 *  below an injection on account of it. */
const isIrreversible = (o) => revRank(o.reversible) === 2;

/** Deliberately NOT tie-broken on evidence grade: within one bucket the
 *  catalogue's own order stands, because Array.sort is stable and because the
 *  entry knows which of two equally cheap options matters for that particular
 *  number. Ranking on grade instead would put the better-studied generic
 *  intervention above the specifically relevant one — a well-trialled massage
 *  ahead of "retake the photograph" on a measurement that is mostly head
 *  position. */
const optionSort = (a, b) =>
  ((isSupported(b) && counts(b)) - (isSupported(a) && counts(a)))
  || (isIrreversible(a) - isIrreversible(b))
  || (kindRank(a.kind) - kindRank(b.kind))
  || (revRank(a.reversible) - revRank(b.reversible));

/** Findings that are both outside their reference and actually modifiable,
 *  ordered so that the reversible and free comes before the irreversible and
 *  expensive.
 *
 *  Metrics flagged uncalibrated, provisional or ancestry-sensitive are dropped
 *  outright. The tool declines to score them, and an intervention recommended
 *  on the basis of a measurement the report itself will not judge is not a
 *  recommendation, it is a sales pitch with a footnote. Note that the profile
 *  path in report.js does not propagate the uncalibrated flag onto its rows, so
 *  the refusal is also encoded catalogue-side as `unscored` and both are
 *  checked here.
 *
 *  opts:
 *    minStatus  'slight' (default) or 'notable' — how far outside counts.
 *    maxKind    cap on invasiveness, e.g. 'topical' to show nothing that
 *               involves a needle. A finding left with nothing that both works
 *               and moves the measurement drops out entirely.
 *    includeNegative  keep options graded contested/none (default true).
 *    catalogue  override INTERVENTIONS, for testing.
 *
 *  These are tunables rather than constants because none of them has a
 *  published basis. Where to cut a list of suggestions is an editorial choice
 *  and is presented as one.
 *
 *  Each finding carries the row it came from, the catalogue summary, the
 *  sorted options, and `lead` — the first option that both works and moves the
 *  measurement, which is what the finding is sorted on. */
export function buildProtocol(rows, opts = {}) {
  const {
    minStatus = 'slight',
    maxKind = 'surgical',
    includeNegative = true,
    catalogue = INTERVENTIONS,
  } = opts;

  const floor = OUTSIDE[minStatus] || 1;
  const kindCap = kindRank(maxKind);
  const out = [];

  for (const item of flattenRows(rows)) {
    const entry = Object.prototype.hasOwnProperty.call(catalogue, item.id)
      ? catalogue[item.id] : null;
    if (!entry || !Array.isArray(entry.options) || entry.unscored) continue;
    if (item.uncalibrated || item.provisional || item.ancestrySensitive) continue;
    if (item.tier === 'folk') continue;
    if (!((OUTSIDE[item.status] || 0) >= floor)) continue;

    let options = entry.options.filter((o) => kindRank(o.kind) <= kindCap);
    if (!includeNegative) options = options.filter(isSupported);
    options = options.sort(optionSort);

    // The finding is only actionable if something in the list both moves the
    // measurement and has evidence behind it. A metric whose entry is all
    // 'nothing moves this' and 'everyone sells it and it does not work' stays
    // in the catalogue, where it documents the negative, and stays out of a
    // list headed "what you can do" — which is the reading it would otherwise
    // get. The unsupported options ride along inside findings that qualify.
    const lead = options.find((o) => isSupported(o) && counts(o));
    if (!lead) continue;

    out.push({
      id: item.id,
      label: item.label,
      display: item.display,
      value: item.value,
      unit: item.unit,
      status: item.status,
      z: item.z,
      direction: item.direction,
      refText: item.refText,
      tier: item.tier,
      mutability: item.mutability,
      mutabilityInfo: item.mutabilityInfo || MUTABILITY[item.mutability] || null,
      summary: entry.summary,
      options,
      lead,
      // True when every route to this number can be walked back. Worth
      // surfacing on its own: it is the difference between trying something
      // and committing to it.
      allReversible: options.every((o) => o.reversible === true),
    });
  }

  // Each finding sorts on its own best option, so the cheap and reversible are
  // read first and nothing irreversible appears above something that is not.
  // Distance from the reference only breaks ties: how far out a number is says
  // nothing about what it would cost to move it.
  return out.sort((a, b) => {
    const r = isIrreversible(a.lead) - isIrreversible(b.lead);
    if (r) return r;
    const k = kindRank(a.lead.kind) - kindRank(b.lead.kind);
    if (k) return k;
    const v = revRank(a.lead.reversible) - revRank(b.lead.reversible);
    if (v) return v;
    const z = Math.abs(b.z || 0) - Math.abs(a.z || 0);
    if (z) return z;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
