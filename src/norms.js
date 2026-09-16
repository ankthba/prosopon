// Normative reference data.
//
// EVIDENCE TIERS - shown in the report so you can weight each number honestly:
//   anthro   Published population anthropometry with a mean and SD. Strongest.
//            Chiefly Farkas, "Anthropometry of the Head and Face" (2nd ed.)
//            and the Farkas et al. 2005 international norms series.
//   clinical Surgical/orthodontic planning conventions. Usually a target range
//            rather than a distribution. Powell & Humphreys, Ricketts,
//            Legan & Burstone, Arnett & Bergman.
//   aesthetic Stated aesthetic ideals with some empirical support but no
//            agreed distribution (neoclassical canons, vermilion ratios).
//   folk     Popular in online "looksmaxxing" material with no clinical
//            literature behind it. Reported because people ask for them,
//            flagged because they are not measurements of anything validated.
//
// ANCESTRY: the anthropometric norms below are predominantly from North
// American and European white samples, because that is what the older
// literature measured. Farkas 2005 documented large, normal differences across
// 25 populations - nasal and lip dimensions especially. A value outside these
// ranges frequently means the reference sample did not look like you. Treated
// as a defect it is simply a measurement error.

export const TIER_LABEL = {
  anthro: 'Population anthropometry (mean ± SD)',
  clinical: 'Clinical planning range',
  aesthetic: 'Aesthetic convention',
  folk: 'Online convention — no clinical basis',
};

// Modifiability: what would actually have to change for the number to move.
export const MUTABILITY = {
  fixed: { label: 'Skeletal — fixed', hint: 'Set by bone. Only orthognathic or implant surgery changes it.' },
  softTissue: { label: 'Soft tissue', hint: 'Responds to body-fat level, hydration, sleep, age and posture.' },
  ortho: { label: 'Orthodontic / surgical', hint: 'Braces, clear aligners or jaw surgery; partly age-limited.' },
  surgical: { label: 'Surgical only', hint: 'Would require a specific cosmetic procedure.' },
  grooming: { label: 'Grooming', hint: 'Changed today, for free, with no clinician involved.' },
  posture: { label: 'Posture / photo', hint: 'Often an artefact of the photograph rather than the face.' },
};

/** nm = normal distribution reference; rg = target range. */
const nm = (mean, sd) => ({ kind: 'nm', mean, sd });
const rg = (lo, hi) => ({ kind: 'rg', lo, hi });

export const NORMS = {
  // ---------- vertical proportion ----------
  thirdsBalance: {
    tier: 'aesthetic', unit: '%', better: 'low',
    all: rg(0, 3),
    uncalibrated: true,
    text: 'Largest deviation of any facial third from an exact 33.3%. NOT SCORED, for two independent reasons. The mesh has no hairline landmark — its topmost point is mid-forehead, so the upper third reads short until you drag the marker to your own hairline. And the equal-thirds canon is a Renaissance drawing convention rather than a measured average: real faces sit about 4–7% off it, so a band tight enough to mean anything would flag almost everyone. The three percentages are shown instead; read them against each other.',
    source: 'Neoclassical canon; non-compliance documented in Farkas et al., Plast Reconstr Surg 1985;75(3):328–338',
    mutability: 'fixed',
  },
  lowerThirdRatio: {
    tier: 'aesthetic', unit: 'ratio', better: 'mid',
    all: rg(0.40, 0.50),
    text: 'Subnasale→stomion as a fraction of stomion→menton. The canon circulates in two incompatible forms — 1:2 (0.50) and 30:70 (0.43) — and measured faces sit at the 30:70 end, near 0.44–0.45 in both sexes.',
    source: 'Powell & Humphreys, Proportions of the Aesthetic Face (1984)',
    mutability: 'fixed',
  },
  facialIndex: {
    tier: 'anthro', unit: 'index', better: 'mid',
    male: nm(88.5, 5.1), female: nm(86.2, 4.6),
    uncalibrated: true,
    text: 'Morphological facial index: nasion→menton height ÷ facial width × 100. NOT SCORED. Width comes from the photographic silhouette, which at the temples runs wider than the caliper cheekbone measurement, so the index reads low — median 83.0 across 18 validation faces against a reference mean of 88.5. It classifies face shape rather than ranking it, and the classical Martin & Saller bands are SEX-SPECIFIC — men: <79 very broad, 79–84 broad, 84–88 average, 88–93 long, >93 very long; women: <77, 77–81, 81–85, 85–90, >90. Applying the male scale to a woman moves her a whole class.',
    source: 'Bands: Martin & Saller (1957) / Garson (1885). Means: Caucasian norms per Armengou et al., Facial Plast Surg 2024;40(3):348–362',
    mutability: 'fixed',
  },
  fwhr: {
    tier: 'anthro', unit: 'ratio', better: 'mid',
    all: nm(1.90, 0.16),
    uncalibrated: true,
    text: 'Facial width-to-height ratio: face width \u00f7 brow-to-upper-lip height. NOT SCORED. The published norm is measured between the bony cheekbone points, but the mesh can only trace the visible silhouette, which runs narrower \u2014 all four calibration portraits landed between 1.58 and 1.72 against a published mean of 1.90, low every time. That is a difference in what is being measured, so the value is shown and the z-score is withheld. Widely studied as a correlate of perceived dominance, though the much-publicised sex difference in adults has largely failed to replicate.',
    source: 'Lefevre et al., Evol Hum Behav 2012; Kramer 2017 (null replication)',
    mutability: 'fixed',
  },

  // ---------- eyes ----------
  canthalTilt: {
    tier: 'anthro', unit: '°', better: 'mid',
    male: nm(4.0, 2.3), female: nm(5.8, 2.3),
    text: 'Angle from the inner to the outer corner of the eye; positive means the outer corner sits higher. Read the male column with caution: both published figures available here were measured on WHITE WOMEN (Kunjur 4.0° ± 2.3, Price 5.8° ± 2.3), and no comparable white-male norm could be located, so the male reference is a placeholder rather than a population value. Tilt drifts downward with age as the lateral canthal tendon loosens — roughly 0.4–0.5° per decade, and mostly after about 70.',
    source: 'Kunjur et al., Br J Oral Maxillofac Surg 2006;44:89–93; Price et al., Plast Reconstr Surg 2009;124:615–623',
    mutability: 'fixed',
  },
  intercanthalMm: {
    tier: 'anthro', unit: 'mm', better: 'mid',
    male: nm(32.9, 2.7), female: nm(31.6, 2.4),
    text: 'Inner-corner to inner-corner distance. Clinically meaningful: above about 37mm is telecanthus, below about 27mm hypotelorism. Within ±2 SD it carries no aesthetic weight.',
    source: 'Farkas et al., J Craniofac Surg 2005 (North American White en–en)',
    mutability: 'fixed',
  },
  icdOverPfl: {
    tier: 'aesthetic', unit: 'ratio', better: 'mid',
    all: rg(0.9, 1.1),
    uncalibrated: true,
    text: 'Inner-corner distance ÷ eye width. NOT SCORED. The mesh measures the visible palpebral aperture, not the caliper canthi: its lateral point sits roughly 2mm medial to the anatomical ex, so eye width reads about 13% short. Evidence: across four calibration portraits the mesh eye width came to 0.426, 0.430, 0.430 and 0.418 of interpupillary distance (mean 0.426) against a caliper value of 31.3/64 = 0.489. A denominator 13% short inflates this ratio by about 15%, which is why it read 1.22–1.30 on those portraits where the classical canon expects ~1.0 — most of that gap is the landmark offset, the remainder is the faces themselves. Shown as a raw measurement and deliberately not scored.',
    source: 'Neoclassical canon; compliance data Farkas et al. 1985',
    mutability: 'fixed',
  },
  pflMm: {
    tier: 'anthro', unit: 'mm', better: 'mid',
    male: nm(31.3, 1.4), female: nm(30.7, 1.6),
    uncalibrated: true,
    text: 'Palpebral fissure length — the horizontal width of the eye opening. NOT SCORED. The mesh measures the visible palpebral aperture rather than the caliper canthi, and its lateral canthus point sits roughly 2mm medial to the true anatomical ex, so this reads about 13% short on every face. Evidence: over four calibration portraits the value came to 0.426, 0.430, 0.430 and 0.418 of interpupillary distance (mean 0.426) where the caliper ratio is 31.3/64 = 0.489. Shown as a raw measurement and deliberately not scored against Farkas reference values.',
    source: 'Farkas',
    mutability: 'fixed',
  },
  pfhMm: {
    tier: 'anthro', unit: 'mm', better: 'mid',
    male: nm(10.4, 1.1), female: nm(11.1, 1.2),
    uncalibrated: true,
    text: 'Palpebral fissure height — vertical opening at the widest point. Strongly affected by expression, so read it only on a relaxed, neutral face. NOT SCORED. Like the width, this is the visible palpebral aperture and not a caliper measurement between anatomical canthi; the same landmark offset makes the paired eye width read about 13% short (measured aperture/interpupillary ratios of 0.426, 0.430, 0.430, 0.418, mean 0.426, against a caliper 31.3/64 = 0.489). Shown as a raw measurement and deliberately not scored.',
    source: 'Farkas',
    mutability: 'softTissue',
  },
  pfhOverPfl: {
    tier: 'aesthetic', unit: 'ratio', better: 'mid',
    all: rg(0.30, 0.38),
    uncalibrated: true,
    text: 'Eye height ÷ eye width. Around 1:3 in a relaxed adult eye. NOT SCORED. Both terms come from the visible palpebral aperture rather than the caliper canthi, and the denominator reads about 13% short — mesh aperture width measured 0.426, 0.430, 0.430 and 0.418 of interpupillary distance (mean 0.426) across four portraits against a caliper 31.3/64 = 0.489 — so the ratio is inflated by roughly the same amount. Shown as a raw measurement and deliberately not scored.',
    source: 'Oculoplastic convention',
    mutability: 'softTissue',
  },
  ipdMm: {
    tier: 'anthro', unit: 'mm', better: 'mid',
    male: nm(64.7, 3.7), female: nm(62.3, 3.6),
    uncalibrated: true,
    text: 'Interpupillary distance. NOT SCORED as a facial measurement — it is here as the calibration check. If this lands far from the normal 52–74mm range, the millimetre scale is off and every absolute figure in the report should be discounted. Across the validation portraits it ran 55–70mm with a median of 58.8mm against a population mean of 64.7, which is the roughly 8% systematic low bias documented on the Method page.',
    source: 'Dodgson, Proc SPIE 5291, 2004, Table 2 (n = 3976)',
    mutability: 'fixed',
  },
  browApexPos: {
    tier: 'aesthetic', unit: 'fraction', better: 'mid',
    all: rg(0.75, 1.00),
    text: 'Where the brow peaks, as a fraction from the inner to the outer corner of the eye. The lateral limbus — the conventional target — actually sits at about 0.69–0.76 of eye width, not the 0.62–0.70 usually quoted, and measured brows peak lateral to it: 0.93 ± 0.15 in 105 ordinary women and 0.98 ± 0.13 in 100 fashion models. Derived from female samples only.',
    source: 'Roth & Metzinger, Arch Facial Plast Surg 2003;5(3):235–239; Kashkouli et al., Aesthetic Plast Surg 2021',
    mutability: 'grooming',
  },
  browEyeMm: {
    tier: 'anthro', unit: 'mm', better: 'mid',
    male: nm(16.5, 3.0), female: nm(19.0, 3.2),
    text: 'Vertical distance from the upper lid margin to the lower edge of the brow at the pupil line.',
    source: 'Price KM, Gupta PK, Woodward JA, Stinnett SS, Murchison AP. Plast Reconstr Surg 2009;124(2):615–623',
    mutability: 'grooming',
  },

  // ---------- nose ----------
  nasalWidthMm: {
    tier: 'anthro', unit: 'mm', better: 'mid',
    male: nm(34.9, 2.1), female: nm(31.4, 2.0),
    ancestrySensitive: true,
    uncalibrated: true,
    text: 'Alar base width. NOT SCORED. Across 18 validation portraits this read 33.9–48.5mm with a median of 42.0mm, against a caliper reference of 34.9mm — about 7mm wide on nearly every face, because the mesh’s widest alar points sit lateral to the palpated alare. It is also the most ancestry-dependent measurement on the face: Farkas 2005 found population means spanning about 14mm across 25 groups. Two independent reasons the number should not be scored; the millimetre value is still shown.',
    source: 'Farkas et al., J Craniofac Surg 2005',
    mutability: 'surgical',
  },
  nasalIndex: {
    tier: 'anthro', unit: 'index', better: 'mid',
    all: rg(55, 100),
    ancestrySensitive: true,
    text: 'Alar width ÷ nasal height × 100. A classification, not a score. Living-nose classes: ≤54.9 hyperleptorrhine, 55–69.9 leptorrhine, 70–84.9 mesorrhine, 85–99.9 platyrrhine, ≥100 hyperplatyrrhine. The North American White reference mean is about 63.7 (male) and 62.1 (female), but Farkas’s 25-population series spans nearly the whole scale. All of these are ordinary.',
    source: 'Classical anthropometric classification; Farkas 2005 population means',
    mutability: 'surgical',
  },
  alarOverIcd: {
    tier: 'aesthetic', unit: 'ratio', better: 'mid',
    all: rg(0.9, 1.1),
    ancestrySensitive: true,
    uncalibrated: true,
    text: 'Nose width ÷ inner-corner distance. NOT SCORED. The canon says they match, but the mesh’s alar points sit lateral to the caliper alare and this ratio came out at 1.13–1.53 (median 1.32) across all 18 validation faces — every single one outside a band centred on 1.0. A reference that rejects the entire population is measuring something other than what it claims. The canon was also written from European faces and is met by well under half of any population.',
    source: 'Neoclassical canon; compliance data Farkas et al. 1985',
    mutability: 'surgical',
  },
  noseOverMouth: {
    tier: 'aesthetic', unit: 'ratio', better: 'mid',
    all: rg(0.60, 0.73),
    ancestrySensitive: true,
    uncalibrated: true,
    text: 'Nose width ÷ mouth width. NOT SCORED: it inherits the alar-width bias above, and came out at 0.70–0.88 (median 0.76) across the validation set against a canon of 0.667, with 15 of 18 faces outside the band. The neoclassical naso-oral canon is mouth = 1.5 × nose, which is 0.667 — not the 0.70 usually quoted — and it varies strongly with ancestry.',
    source: 'Neoclassical canon; Wang, Qian, Zhang & Farkas, Aesthetic Plast Surg 1997;21(4):265–269',
    mutability: 'surgical',
  },

  // ---------- mouth and chin ----------
  mouthWidthMm: {
    tier: 'anthro', unit: 'mm', better: 'mid',
    male: nm(54.5, 3.0), female: nm(50.2, 3.5),
    uncalibrated: true,
    text: 'Corner-to-corner mouth width on a relaxed face. NOT SCORED. Farkas measured this with calipers on the palpated cheilion; read off a photograph the mouth corner sits differently, and the validation set came out at 40.8–66.8mm with 13 of 18 faces outside the reference. Expression makes it worse — a slight smile widens the mouth measurably. The millimetre value is shown; compare it against yourself.',
    source: 'Farkas, Katic & Forrest, Ann Plast Surg 2007;59:692–698 (North American White ch–ch)',
    mutability: 'fixed',
  },
  vermilionRatio: {
    tier: 'aesthetic', unit: 'ratio', better: 'mid',
    all: rg(0.50, 0.80),
    text: 'Upper lip height ÷ lower lip height. A fuller lower lip is typical; roughly 1:1.6 (0.62) is the usual aesthetic target, and this is one of the few ratios that observers reliably agree on.',
    source: 'Penna et al., Aesthetic Plast Surg 2010',
    mutability: 'softTissue',
  },
  vermilionOverLower3: {
    tier: 'aesthetic', unit: '%', better: 'mid',
    all: rg(22, 32),
    text: 'Combined lip height as a share of the lower third. Declines with age as the vermilion thins and the philtrum lengthens.',
    source: 'Iblher et al., J Plast Reconstr Aesthet Surg 2008',
    mutability: 'softTissue',
  },
  philtrumMm: {
    tier: 'anthro', unit: 'mm', better: 'mid',
    male: nm(15.8, 2.2), female: nm(14.0, 2.0),
    text: 'Subnasale to the top of the upper lip. Widely misquoted: consumer sites label Farkas’s subnasale-to-stomion figure (22.3mm in men) as philtrum length, which it is not. Direct subnasale-to-labrale-superius studies cluster at 15.7–15.9mm in men and 13.9–14.3mm in women. Lengthens with age; a long philtrum with a thin upper lip is the classic ageing-mouth pattern.',
    source: 'Pooled direct sn–ls studies: JPRAS Open 2024 (PMC11381962); JPRAS Open 2023 (PMC10825920)',
    mutability: 'surgical',
  },
  philtrumOverChin: {
    tier: 'aesthetic', unit: 'ratio', better: 'mid',
    all: rg(0.27, 0.37),
    text: 'Philtrum length ÷ chin height (stomion→menton). The often-quoted 1:2.2 belongs to a different pair of landmarks; computed the way this tool measures it, Farkas’s own components give about 0.32 in both sexes.',
    source: 'Derived from Farkas North American White components (sn–me, sn–sto) with direct sn–ls values',
    mutability: 'fixed',
  },

  // ---------- jaw ----------
  bigonialOverBizygo: {
    tier: 'aesthetic', unit: 'ratio', better: 'mid',
    male: rg(0.74, 0.84), female: rg(0.70, 0.80),
    uncalibrated: true,
    text: 'Jaw width ÷ cheekbone width — how much the face tapers. NOT SCORED: the caliper benchmark (bigonial about 70–75% of bizygomatic) is taken on palpated bone points, while this is the photographic silhouette, which traces soft tissue and hair. The two are not comparable. Useful against yourself over time — masseter bulk raises it, body-fat gain flattens the taper.',
    source: 'Caliper benchmark 0.70–0.75 from Farkas-derived tabulations; the silhouette measurement is not equivalent',
    mutability: 'softTissue',
  },
  jawAngleSharpness: {
    tier: 'aesthetic', unit: '\u00b0', better: 'low',
    all: rg(140, 165),
    uncalibrated: true,
    text: 'How sharply the silhouette turns at the jaw angle, seen from the front. NOT SCORED, because no published reference exists for this projection \u2014 it is not the gonial angle, which is measured in profile against the ramus. Across the calibration portraits it ran 148.5\u2013157.3\u00b0, so read it against yourself over time rather than against a population: a lower number is a more defined corner. The profile module gives the real jaw angle.',
    source: 'Derived frontal proxy \u2014 no published norm',
    mutability: 'softTissue',
  },

  // ---------- symmetry ----------
  symmetryRms: {
    tier: 'anthro', unit: 'mm', better: 'low',
    all: rg(0, 3.0),
    uncalibrated: true,
    text: 'RMS mismatch between each landmark and its mirror image across the fitted midline. NOT SCORED against a population: the measurement is dominated by head yaw rather than by the face, and across the 18 validation portraits it ran 0.9–14.2mm with a median of 4.8mm, against a population mean near 1.2mm. Everyone is asymmetric, and observers generally cannot detect differences under about 3mm. Read it against your own photographs taken at the same angle, and only trust it when yaw is under about 3°.',
    source: 'Derived; detection threshold from Chu EA, Farrag TY, Ishii LE, Byrne PJ. Threshold of visual perception of facial asymmetry in a facial paralysis model. Arch Facial Plast Surg 2011;13(1):14–19 (PMID 21242426)',
    mutability: 'softTissue',
  },

  // ---------- reported because people ask; not validated ----------
  midfaceRatio: {
    tier: 'folk', unit: 'ratio', better: 'mid',
    all: rg(0.95, 1.10),
    text: 'Interpupillary distance ÷ pupil-line-to-upper-lip distance. Circulates online as a "compactness" metric. It has no clinical literature and no established normal range — the band shown is descriptive of typical faces, not a target.',
    source: 'Online convention. No peer-reviewed basis.',
    mutability: 'fixed',
  },
  eyeSeparationRatio: {
    tier: 'folk', unit: 'ratio', better: 'mid',
    all: rg(0.44, 0.49),
    text: 'Interpupillary distance ÷ facial width. Sometimes cited from a single 1985 attractiveness study, which found a weak effect on drawings, not photographs.',
    source: 'Online convention; the underlying attractiveness finding is Pallett, Link & Lee, Vision Res 2010',
    mutability: 'fixed',
  },
};

// ---------- profile (cephalometric) ----------
export const PROFILE_NORMS = {
  nasofrontal: {
    tier: 'clinical', unit: '°', all: rg(115, 130),
    text: 'Glabella–nasion–nose tip. The depth of the nasal root. A shallow root reads as a "continuous" brow-to-nose line; a deep one separates them.',
    source: 'Powell & Humphreys, Proportions of the Aesthetic Face (1984)', mutability: 'surgical',
  },
  nasolabial: {
    tier: 'clinical', unit: '°',
    male: rg(90, 100), female: rg(95, 110),
    text: 'Columella–subnasale–upper lip: how rotated the nose tip is. The single most-quoted number in rhinoplasty planning.',
    source: 'Powell & Humphreys; Armijo, Brown & Guyuron, Plast Reconstr Surg 2012;129(3):759–764', mutability: 'surgical',
  },
  nasofacial: {
    tier: 'clinical', unit: '°', all: rg(30, 40),
    text: 'Facial plane against the nasal dorsum — nasal projection relative to the face as a whole.',
    source: 'Powell & Humphreys', mutability: 'surgical',
  },
  nasomental: {
    tier: 'clinical', unit: '°', all: rg(120, 132),
    text: 'Nose against chin. Chin projection and nasal projection trade off here, which is why chin implants are often proposed for a "big nose".',
    source: 'Powell & Humphreys', mutability: 'surgical',
  },
  facialConvexity: {
    tier: 'clinical', unit: '°', all: rg(164, 172),
    text: 'Glabella–subnasale–pogonion. Legan & Burstone publish this as a deviation from straight, 12° ± 4, which is an interior angle of 168° ± 4. Below the band is a convex profile (a retruded chin or protruded maxilla); above it, concave.',
    source: 'Legan & Burstone, J Oral Surg 1980;38(10):744–751 (G–Sn–Pg′ = 12° ± 4)', mutability: 'ortho',
  },
  mentolabial: {
    tier: 'clinical', unit: '°', all: rg(112, 138),
    text: 'Depth of the crease between lower lip and chin. Farkas gives 113.5° ± 20.7 for white men and 121.4° ± 14.4 for white women — note how wide those standard deviations are, which is why only a large deviation means anything here.',
    source: 'Naini et al., Maxillofac Plast Reconstr Surg 2017;39(1):4, reviewing Farkas and Nanda', mutability: 'ortho',
  },
  eLineUpper: {
    tier: 'clinical', unit: 'mm', all: rg(-7, -1),
    text: 'Upper lip relative to the nose-tip–chin line. Negative means behind the line, which is normal: about −4mm.',
    source: 'Ricketts, Am J Orthod 1968', mutability: 'ortho',
  },
  eLineLower: {
    tier: 'clinical', unit: 'mm', all: rg(-5, 1),
    text: 'Lower lip relative to the same line. About −2mm is typical.',
    source: 'Ricketts', mutability: 'ortho',
  },
  gonialSoft: {
    tier: 'clinical', unit: '°', all: rg(120, 136),
    text: 'Soft-tissue jaw angle: the ramus line against the mandibular border, taken tragion–gonion–menton. A published photographic norm for this exact angle is 128.1° ± 8.1. The radiographic gonial angle is a different measurement on different landmarks — Björk–Jarabak 130° ± 7, Riolo 124° ± 6 in men and 122° ± 4 in women — and only a lateral cephalogram gives it.',
    source: 'Gupta et al. 2022 (Tr–Go′–Me′ 128.1° ± 8.07); radiographic anchors Björk–Jarabak and Riolo et al. 1974', mutability: 'fixed',
  },
  mandibularPlane: {
    tier: 'clinical', unit: '°', all: rg(17, 28),
    text: 'Mandibular border against Frankfort horizontal. High angle means a downward-rotated, longer face; low angle a square, short one. Genuinely diagnostic in orthodontics.',
    source: 'Downs’ norm (mean 21.9°), as used in the Tweed and Steiner analyses', mutability: 'ortho',
  },
  ramusMandibleRatio: {
    tier: 'clinical', unit: 'ratio', all: rg(0.62, 0.78),
    uncalibrated: true,
    text: 'Ramus length ÷ mandibular body length, taken gonion–tragion over gonion–menton. NOT SCORED: tragion is only a surface approximation of the condyle, and no published norm exists for the ratio measured this way. Compare it against yourself, not against the band.',
    source: 'No published norm for this soft-tissue construction', mutability: 'fixed',
  },
  mentocervical: {
    tier: 'clinical', unit: '\u00b0', all: rg(80, 95),
    text: 'Facial plane against the line from chin to the deepest point under the jaw. A compact way to describe the chin-and-neck relationship that needs no extra neck landmark. Rises with submental fullness and with a retruded chin.',
    source: 'Powell & Humphreys, Proportions of the Aesthetic Face (1984)', mutability: 'softTissue',
  },
  submentalCervical: {
    tier: 'clinical', unit: '°', all: rg(105, 120),
    text: 'The cervicomental angle: the under-chin line against the neck. Ellenbogen & Karlin make 105–120° one of their five criteria for a youthful neck. Strongly driven by submental fat and by how you hold your head — the most posture-sensitive number here.',
    source: 'Ellenbogen & Karlin, Plast Reconstr Surg 1980;66(6):826–837', mutability: 'softTissue',
  },
  goodeRatio: {
    tier: 'clinical', unit: 'ratio', all: rg(0.55, 0.60),
    text: 'Nasal projection: alar crease→tip ÷ nasion→tip.',
    source: 'Goode’s method, in Rhinoplasty: Problems and Controversies (1986)', mutability: 'surgical',
  },
};

/** Pick the sex-specific reference if one exists. */
export function refFor(entry, sex) {
  if (!entry) return null;
  if (sex && entry[sex]) return entry[sex];
  return entry.all || entry.male || null;
}

/** Score a value against a reference.
 *  Returns { z, status, pctile } where status is one of
 *  'typical' | 'slight' | 'notable'. */
export function evaluate(value, ref) {
  if (ref == null || !Number.isFinite(value)) return { status: 'unknown' };
  if (ref.kind === 'nm') {
    const z = (value - ref.mean) / ref.sd;
    const a = Math.abs(z);
    return {
      z,
      pctile: normCdf(z) * 100,
      status: a <= 1 ? 'typical' : a <= 2 ? 'slight' : 'notable',
    };
  }
  const { lo, hi } = ref;
  if (value >= lo && value <= hi) return { z: 0, status: 'typical' };
  const span = (hi - lo) || 1;
  const over = value < lo ? (lo - value) / span : (value - hi) / span;
  return { z: value < lo ? -over : over, status: over <= 0.5 ? 'slight' : 'notable' };
}

/** Abramowitz & Stegun 26.2.17 normal CDF. */
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  let p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
          t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export function fmtRef(ref, unit) {
  if (!ref) return '—';
  const u = unit === 'ratio' || unit === 'index' || unit === 'fraction' ? '' : unit;
  if (ref.kind === 'nm') return `${ref.mean}${u} ± ${ref.sd}`;
  return `${ref.lo} – ${ref.hi}${u}`;
}
