// Appearance markers: brow density, lip surface, iris colour, skin texture.
//
// These are the four figures the commercial products of this genre report as
// "beauty markers", with a score beside each one. None of them has a published
// population distribution to score against, so nothing here is scored and this
// module contains no reference ranges at all. What it measures is the image:
// how much of the brow polygon is hair-dark relative to the forehead beside
// it, how much high-frequency energy the vermilion carries, what colour the
// iris annulus averages to, how large the luminance residual is over cheek and
// forehead. Those are real measurements of a photograph and nothing more. A
// figure here is comparable against the same face shot on the same camera in
// the same light, and against nothing else.
//
// The two 0-100 figures (lips.smoothness, skin.evennessPct) are monotone
// remappings of a physical quantity through a constant with no basis in
// anything published. Those constants live in TUNING and can be overridden per
// call, because that is what they are: presentation choices, not norms.
//
// RETURNED SHAPE. Every number, its unit, and what moves it. NaN means that
// figure could not be computed, and a warning always says why. Usually that
// comes with `ok: false` on the whole region; the exception is a brow that was
// sampled successfully but in which no pixel fell below the hair threshold,
// where coveredPct is a real 0 and hairL and separationL are NaN because there
// were no hair pixels to average. That case has its own warning.
//
//   brows.R, brows.L
//     ok           false when too few pixels fell inside the brow polygon.
//     coveredPct   % of the brow polygon classified as hair (0-100).
//     hairL        mean L* of the pixels classified as hair (0-100).
//     skinL        trimmed mean L* of the forehead patch above the brow.
//     thresholdL   the L* cut that separated the two, derived from skinL.
//     separationL  skinL - hairL. Small means the classification failed.
//     areaPx2      brow polygon area, in pixels. Scales with photo size.
//     areaMm2      the same area through the iris scale; NaN if uncalibrated.
//     hairPx, sampledPx, refPx   the pixel counts behind the figures above.
//     poly         the sampled polygon, in image coordinates, for the overlay.
//   brows.asymmetryPct
//     |R-L| coverage difference over their mean, in %. Grooming, lighting and
//     head yaw all move it; it is not a measure of the face alone.
//
//   lips.smoothness       0-100, higher = less high-frequency energy inside
//                         the vermilion. Vertical lip lines lower it, so does
//                         a dry or flaking surface; so does lipstick, in the
//                         other direction.
//   lips.textureSd        SD of the luminance residual inside the vermilion,
//                         in L* units. The unmapped version of the above.
//   lips.borderSharpness  luminance step across the vermilion border, in L*
//                         units per 1% of interpupillary distance. Softens
//                         with age, and with every kind of image blur.
//
//   irises.R, irises.L
//     ok           false when the annulus yielded too few usable pixels.
//     L, a, b      trimmed mean CIELAB of the iris annulus.
//     chroma, hue  hypot(a,b) and atan2(b,a) in degrees, 0-360.
//     hex          display swatch (see hexOf: it is not an inverse of L*a*b*).
//     category     brown / hazel / green / blue / grey, by the documented cuts.
//     radiusPx     fitted iris radius; the annulus sampled lies inside it.
//     n, specPx, rawPx   pixels kept, dropped as highlight, and tested.
//     centre, inner, outer   annulus geometry in image coordinates, for the
//                  overlay: the ring actually measured, not the whole iris.
//   irises.agreement
//     deltaE, dL, dChroma, sameCategory, plausible. A sanity check on the
//     sampling, NOT a finding about the eyes - see the comment on irisAgree.
//
//   skin.textureEnergy    mean SD of the luminance residual over the sampled
//                         regions, in L* units.
//   skin.evennessPct      0-100 remapping of the above, higher = smoother.
//   skin.regions[id]      { id, label, ok, sd, n, L, a, b, ita, px, radiusPx,
//                         c } — per region: its own residual SD in L* units,
//                         its trimmed mean tone, the pixel counts, and the
//                         sampled disc (c, radiusPx) for the overlay.
//
//   warnings              plain sentences. The first is always the statement
//                         that none of this is scored, because a caller that
//                         renders the numbers and drops that sentence has
//                         built the thing this module exists to avoid.

import { dist, centroid, sub, norm as vnorm, clamp } from './geom.js';
import {
  IDX, R_BROW_RING, L_BROW_RING, UPPER_LIP_OUTER, LOWER_LIP_OUTER,
  R_EYE_RING, L_EYE_RING, mmScale,
} from './landmarks.js';
import { rgbToLab, ita, deltaE } from './skin.js';

// Every constant below is a tunable, not a norm. Nothing in the literature
// fixes any of them; they were chosen so that ordinary portraits land in the
// middle of each range rather than piled against an end, and they are
// overridable through the third argument of analyseTexture so that a caller
// who disagrees can say so in code rather than in prose. Lengths given in
// "IPD units" are fractions of the interpupillary distance, which keeps every
// sample area the same size relative to the face at any image resolution.
const TUNING = {
  // --- brows ---
  browOutward: 0.16,       // radial dilation of the brow ring, as a fraction of its own radius
  browDown: 0.06,          // extra downward push of the ring's lower half, IPD units
  browRefUp: 0.30,         // forehead reference patch, this far above the brow centroid
  browRefR: 0.10,          // radius of that patch, IPD units
  browDropFrac: 0.18,      // hair is this fraction darker than the local skin...
  browDropMin: 4,          // ...but the cut never sits closer than this many L* units
  browMinSeparation: 6,    // below this, hair and skin were not actually separated
  browMinPx: 400,
  browRefMinL: 32,         // below this the "forehead" patch is hair or shadow, not skin

  // --- lips ---
  lipErode: 0.90,          // shrink toward the lip centroid before measuring texture
  lipStepFrac: 0.010,      // Laplacian arm length, IPD units
  lipBlurFrac: 0.008,      // high-pass blur radius, IPD units
  // Calibrated, not guessed: over the eighteen validation portraits the mean
  // |Laplacian| inside the vermilion ran 8.2 (p90) / 15.2 (median) / 21.8 (p10),
  // so scale = median / ln 2 puts the median face at 50 and the set at 37-69.
  // At the shipped default of 3.0 fifteen of eighteen scored below 2.0 and the
  // measure could not discriminate at all.
  lipEnergyScale: 21.9,    // L* units of mean |Laplacian| that map to 1/e smoothness
  lipBorderSpan: 0.035,    // half-length of the border profile, IPD units
  lipBorderSamples: 7,
  lipMinPx: 400,

  // --- irises ---
  irisInner: 0.55,         // annulus inner edge, as a fraction of iris radius
  irisOuter: 0.90,         // outer edge, kept off the limbus
  irisLidErode: 0.88,      // shrink the eye ring to drop the lash line
  irisSpecL: 78,           // a pixel this light...
  irisSpecC: 14,           // ...and this neutral is a catchlight, not iris
  irisSpecMaxFrac: 0.35,   // above this rejected fraction the sample is suspect
  irisMinPx: 60,
  irisAgreeMaxDe: 12,      // two eyes further apart than this were sampled badly
  irisGreyC: 6,            // chroma below this is neutral
  irisDarkL: 42,           // warm irises below this L* are called brown
  irisBlueB: -1.5,         // b* below this is on the blue side
  irisGreenHue: 95,        // hue above this, with b* positive, is called green
  irisWeakC: 12,           // below this chroma AND below irisWeakL, the hue is noise
  irisWeakL: 45,           // ...so the category is 'indeterminate' rather than a guess

  // --- skin ---
  skinBlurFrac: 0.020,     // high-pass blur radius over cheek and forehead, IPD units
  // Same calibration: residual SD over the reference set ran 1.92 / 3.29 / 5.17
  // (p90 / median / p10), so the median lands at 50 and the set spans 34-67.
  skinEnergyScale: 4.75,   // L* units of residual SD that map to 1/e evenness
  skinMinPx: 600,

  // --- warnings ---
  lightAsymL: 6,           // the left/right cheek L* test, same cut skin.js uses
  filterMinDim: 900,       // resolution above which smoothing has no innocent explanation
  filterEnergy: 0.35,      // residual SD below which the skin is not skin

  trim: 0.15,              // fraction dropped from each end of every sample
};

const NO_REFERENCE = 'None of the figures in this section is scored. Brow density, lip smoothness, iris colour and skin texture have no published population norm to be scored against — they are measurements of this photograph, and they are comparable only against the same face shot on the same camera in the same light. Anything that reports them out of ten is inventing the scale.';

// ---------- pixel access ----------

/** Detached canvas, never attached to the document; the 2D context is the only
 *  way to read pixels out of an <img>. */
function imagePixels(imageEl, imgW, imgH) {
  const cv = document.createElement('canvas');
  cv.width = imgW; cv.height = imgH;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(imageEl, 0, 0, imgW, imgH);
  return g.getImageData(0, 0, imgW, imgH);
}

const opaque = (data, i) => data[i + 3] >= 200;

/** Mean L* of the 3x3 neighbourhood at (x,y). A single pixel at the spans used
 *  for the border profile is dominated by sensor noise. */
function localL(data, w, h, x, y) {
  const cx = Math.round(x), cy = Math.round(y);
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return NaN;
  let s = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const sx = cx + dx, sy = cy + dy;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = (sy * w + sx) * 4;
      if (!opaque(data, i)) continue;
      s += rgbToLab(data[i], data[i + 1], data[i + 2]).L;
      n++;
    }
  }
  return n ? s / n : NaN;
}

// ---------- polygons ----------

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y)
      && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

/** Uniform scale about the centroid. Values below 1 erode, above 1 dilate. */
function scalePoly(poly, k) {
  const c = centroid(poly);
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
}

function bboxOf(poly, pad, w, h) {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(...xs) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys) + pad));
  if (x1 < x0 || y1 < y0) return null;
  return { x0, y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1 };
}

// ---------- planes ----------
//
// A "plane" is the L* channel of one rectangle of the image plus a mask saying
// which pixels belong to the region. Texture has to be computed on a grid
// rather than on a bag of sampled pixels, because every operator here reads a
// pixel's neighbours.

function makePlane(data, w, h, box, keep) {
  const { x0, y0, bw, bh } = box;
  const L = new Float32Array(bw * bh);
  const ok = new Uint8Array(bw * bh);
  let n = 0;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const sx = x0 + x, sy = y0 + y;
      if (!keep(sx + 0.5, sy + 0.5)) continue;
      const i = (sy * w + sx) * 4;
      if (!opaque(data, i)) continue;
      const j = y * bw + x;
      L[j] = rgbToLab(data[i], data[i + 1], data[i + 2]).L;
      ok[j] = 1;
      n++;
    }
  }
  return { L, ok, x0, y0, bw, bh, n };
}

const polyPlane = (data, w, h, poly) => {
  const box = bboxOf(poly, 1, w, h);
  return box ? makePlane(data, w, h, box, (x, y) => inPoly(x, y, poly)) : null;
};

const discPlane = (data, w, h, c, r) => {
  const box = bboxOf([{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r }], 1, w, h);
  const r2 = r * r;
  return box ? makePlane(data, w, h, box,
    (x, y) => (x - c.x) ** 2 + (y - c.y) ** 2 <= r2) : null;
};

/** Separable box blur over a masked plane, returning both the window mean and
 *  the number of valid pixels that produced it so callers can reject pixels
 *  whose window hangs off the region.
 *
 *  Written as a sliding sum rather than the obvious nested loop: the blur
 *  radius scales with face size, so on a large photograph the naive version is
 *  quadratic in radius across tens of thousands of pixels. */
function boxBlur(L, ok, bw, bh, r) {
  const rowSum = new Float32Array(bw * bh);
  const rowCnt = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    let s = 0, c = 0;
    for (let x = 0; x < bw; x++) {
      if (x === 0) {
        for (let k = 0; k <= r && k < bw; k++) {
          const i = y * bw + k;
          if (ok[i]) { s += L[i]; c++; }
        }
      } else {
        const drop = x - r - 1, add = x + r;
        if (drop >= 0) { const i = y * bw + drop; if (ok[i]) { s -= L[i]; c--; } }
        if (add < bw) { const i = y * bw + add; if (ok[i]) { s += L[i]; c++; } }
      }
      rowSum[y * bw + x] = s;
      rowCnt[y * bw + x] = c;
    }
  }
  const mean = new Float32Array(bw * bh);
  const count = new Float32Array(bw * bh);
  for (let x = 0; x < bw; x++) {
    let s = 0, c = 0;
    for (let y = 0; y < bh; y++) {
      if (y === 0) {
        for (let k = 0; k <= r && k < bh; k++) {
          const i = k * bw + x;
          s += rowSum[i]; c += rowCnt[i];
        }
      } else {
        const drop = y - r - 1, add = y + r;
        if (drop >= 0) { const i = drop * bw + x; s -= rowSum[i]; c -= rowCnt[i]; }
        if (add < bh) { const i = add * bw + x; s += rowSum[i]; c += rowCnt[i]; }
      }
      const i = y * bw + x;
      mean[i] = c > 0 ? s / c : 0;
      count[i] = c;
    }
  }
  return { mean, count };
}

/** SD of the luminance residual after a box blur: the high-pass energy of the
 *  region. Pixels whose blur window is mostly outside the region are dropped,
 *  because there the residual measures the boundary rather than the surface. */
function residualSd(plane, r) {
  const { L, ok, bw, bh } = plane;
  const { mean, count } = boxBlur(L, ok, bw, bh, r);
  const full = (2 * r + 1) ** 2;
  const vals = [];
  for (let i = 0; i < L.length; i++) {
    if (!ok[i] || count[i] < full * 0.6) continue;
    vals.push(L[i] - mean[i]);
  }
  if (vals.length < 2) return { sd: NaN, n: vals.length };
  const m = vals.reduce((s, v) => s + v, 0) / vals.length;
  const varr = vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length;
  return { sd: Math.sqrt(varr), n: vals.length };
}

// ---------- sampling statistics ----------

/** Pixels of a disc as {rgb, lab} entries. Mirrors skin.js sampleDisc; that
 *  module keeps its sampler and its trimmed mean private, and widening its
 *  exports to share them would be a change to a file this module only reads. */
function discEntries(data, w, h, cx, cy, r) {
  const out = [];
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      const i = (y * w + x) * 4;
      if (!opaque(data, i)) continue;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      out.push({ rgb, lab: rgbToLab(rgb[0], rgb[1], rgb[2]) });
    }
  }
  return out;
}

/** Trimmed mean in both CIELAB and sRGB, dropping the darkest and lightest
 *  `frac` of the sample at each end. Same 15% trim skin.js uses, for the same
 *  reason: stray hairs, catchlights and shadow edges otherwise set the mean. */
function trimmedMean(entries, frac) {
  if (entries.length < 8) return null;
  const s = [...entries].sort((p, q) => p.lab.L - q.lab.L);
  const cut = Math.floor(s.length * frac);
  const core = s.slice(cut, s.length - cut);
  if (core.length < 4) return null;
  const n = core.length;
  const acc = core.reduce((a, e) => ({
    L: a.L + e.lab.L, a: a.a + e.lab.a, b: a.b + e.lab.b,
    r: a.r + e.rgb[0], g: a.g + e.rgb[1], bl: a.bl + e.rgb[2],
  }), { L: 0, a: 0, b: 0, r: 0, g: 0, bl: 0 });
  const m = { L: acc.L / n, a: acc.a / n, b: acc.b / n };
  const varL = core.reduce((t, e) => t + (e.lab.L - m.L) ** 2, 0) / n;
  return { ...m, sdL: Math.sqrt(varL), rgb: [acc.r / n, acc.g / n, acc.bl / n], n, nRaw: entries.length };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const h = s.length / 2;
  return s.length % 2 ? s[Math.floor(h)] : (s[h - 1] + s[h]) / 2;
}

/** Display swatch only. This is the trimmed mean of the sampled sRGB bytes,
 *  not an inverse transform of the mean L*a*b* above it: skin.js carries no
 *  Lab-to-RGB direction and a colour chip does not justify adding one.
 *  Averaging gamma-encoded bytes biases slightly dark; the Lab triple is the
 *  measurement, the hex is a picture of it. */
function hexOf(rgb) {
  const h = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}

// ---------- brows ----------

/** Brow polygon: the mesh ring dilated outward, with its lower half pushed
 *  down. The ring tracks the visible brow contour, and hair extends past it on
 *  the outside and especially below, so the undilated ring undercounts on
 *  everyone. Both sides are built by the identical construction, which is what
 *  makes the left-right difference mean anything. */
function browPolygon(P, side, u, T) {
  const ring = (side === 'R' ? R_BROW_RING : L_BROW_RING).map((i) => P[i]);
  const c = centroid(ring);
  return ring.map((p) => {
    const q = {
      x: c.x + (p.x - c.x) * (1 + T.browOutward),
      y: c.y + (p.y - c.y) * (1 + T.browOutward),
    };
    // Image y grows downward, so the ring's lower half is the larger y.
    if (p.y > c.y) q.y += T.browDown * u;
    return q;
  });
}

/** Brow density against a LOCAL skin reference.
 *
 *  The threshold is derived from the forehead just above the brow rather than
 *  set at an absolute L*, because an absolute cut classifies by skin tone: any
 *  fixed value dark enough to exclude light skin swallows the whole brow
 *  region of a dark-skinned subject, and any value light enough for dark skin
 *  calls half a pale forehead hair. The cut is a proportional drop from the
 *  local skin, floored at a few L* units so it does not collapse to nothing on
 *  a very dark reference.
 *
 *  This fails quietly on grey, blonde and microbladed brows, where hair and
 *  skin genuinely do not differ in lightness. separationL is returned so the
 *  caller can see that happen rather than read a low coverage as a thin brow. */
function browDensity(data, w, h, P, side, u, T, mmPerPx) {
  const poly = browPolygon(P, side, u, T);
  const ring = (side === 'R' ? R_BROW_RING : L_BROW_RING).map((i) => P[i]);
  const c = centroid(ring);
  const ref = trimmedMean(
    discEntries(data, w, h, c.x, c.y - T.browRefUp * u, T.browRefR * u), T.trim);
  // The reference patch sits a fixed distance above the brow, which lands on a
  // fringe, a hat or a shadow often enough to matter: on one validation
  // portrait it came back at L* 24, so the hair threshold fell below every
  // pixel in the brow and coverage reported a confident 0%. A patch darker than
  // `browRefMinL` is not forehead skin, and a brow measured against it is not a
  // brow measurement.
  const refUsable = !!ref && ref.L >= T.browRefMinL;
  const plane = polyPlane(data, w, h, poly);
  const sampledPx = plane ? plane.n : 0;
  const base = {
    ok: false, coveredPct: NaN, hairL: NaN, skinL: ref ? ref.L : NaN,
    thresholdL: NaN, separationL: NaN,
    areaPx2: sampledPx, areaMm2: NaN,
    hairPx: 0, sampledPx, refPx: ref ? ref.n : 0, poly,
  };
  if (!refUsable || !plane || sampledPx < T.browMinPx) {
    return { ...base, refObstructed: !!ref && !refUsable };
  }

  const thresholdL = ref.L - Math.max(T.browDropMin, ref.L * T.browDropFrac);
  let hairPx = 0, hairSum = 0;
  for (let i = 0; i < plane.L.length; i++) {
    if (!plane.ok[i] || plane.L[i] >= thresholdL) continue;
    hairPx++;
    hairSum += plane.L[i];
  }
  const hairL = hairPx ? hairSum / hairPx : NaN;
  return {
    ...base,
    ok: true,
    coveredPct: (hairPx / sampledPx) * 100,
    hairL,
    thresholdL,
    separationL: ref.L - hairL,
    // Squared, so the millimetre figure carries twice the relative error of
    // the iris scale it comes from.
    areaMm2: Number.isFinite(mmPerPx) ? sampledPx * mmPerPx * mmPerPx : NaN,
    hairPx,
  };
}

// ---------- lips ----------

// The commissures are creases, the darkest structure near the mouth, and a
// profile taken across one measures the crease rather than the vermilion
// border: it reads as a knife-edge on every face at every age. Their immediate
// neighbours go with them, because the outline is dense at the corner.
const LIP_BORDER_SKIP = new Set([IDX.R_cheilion, IDX.L_cheilion, 185, 146, 409, 375]);

function lipOutline(P) {
  // slice() before reverse(): reverse() mutates in place and LOWER_LIP_OUTER is
  // a module-level constant shared with every other consumer of landmarks.js.
  const idx = [...UPPER_LIP_OUTER, ...LOWER_LIP_OUTER.slice(1, -1).reverse()];
  return { idx, pts: idx.map((i) => P[i]) };
}

/** Vermilion surface texture and border definition.
 *
 *  Texture is measured inside an eroded outline: the border itself is the
 *  largest luminance step anywhere on the mouth, and leaving it in makes every
 *  lip look equally rough.
 *
 *  Both the Laplacian arm and the blur radius are fractions of the
 *  interpupillary distance rather than fixed pixel counts. A fixed-pixel
 *  operator measures a different spatial frequency on every photograph, so the
 *  same lip shot closer would score smoother for no reason but framing. This
 *  removes image scale; it does not remove focus, compression or retouching,
 *  which move the number as much as the lip does. */
function lipTexture(data, w, h, P, u, T) {
  const { idx, pts } = lipOutline(P);
  const eroded = scalePoly(pts, T.lipErode);
  const plane = polyPlane(data, w, h, eroded);
  const n = plane ? plane.n : 0;

  let energy = NaN, textureSd = NaN;
  if (plane && n >= T.lipMinPx) {
    const s = Math.max(1, Math.round(T.lipStepFrac * u));
    const { L, ok, bw, bh } = plane;
    let sum = 0, cnt = 0;
    for (let y = s; y < bh - s; y++) {
      for (let x = s; x < bw - s; x++) {
        const i = y * bw + x;
        if (!ok[i] || !ok[i - s] || !ok[i + s] || !ok[i - s * bw] || !ok[i + s * bw]) continue;
        sum += Math.abs(4 * L[i] - L[i - s] - L[i + s] - L[i - s * bw] - L[i + s * bw]);
        cnt++;
      }
    }
    energy = cnt ? sum / cnt : NaN;
    textureSd = residualSd(plane, Math.max(1, Math.round(T.lipBlurFrac * u))).sd;
  }

  // The 0-100 scale is 100 * exp(-energy / lipEnergyScale). The constant sets
  // where the curve bends and nothing else; it is arbitrary, it is a tunable,
  // and it is not calibrated against any population. Higher means less
  // high-frequency energy inside the vermilion. It does not mean better, and
  // two of these numbers are comparable only when they come from the same
  // person, camera, lens, lighting and distance.
  const smoothness = Number.isFinite(energy)
    ? 100 * Math.exp(-energy / T.lipEnergyScale) : NaN;

  // Border sharpness: the steepest luminance step along a short profile run
  // outward through each outline vertex. The vermilion outline is close enough
  // to convex that the centroid-to-vertex ray is a usable outward normal; an
  // edge normal would be better in principle and is unstable in practice,
  // because neighbouring outline points can sit a pixel apart.
  const c = centroid(pts);
  const span = T.lipBorderSpan * u;
  const k = Math.max(3, T.lipBorderSamples);
  const step = (2 * span) / (k - 1);
  const perUnit = (0.01 * u) / (step || 1);   // L* per step -> L* per 1% of IPD
  const grads = [];
  for (let v = 0; v < pts.length; v++) {
    if (LIP_BORDER_SKIP.has(idx[v])) continue;
    const dir = vnorm(sub(pts[v], c));
    const profile = [];
    for (let j = 0; j < k; j++) {
      const t = -span + j * step;
      profile.push(localL(data, w, h, pts[v].x + dir.x * t, pts[v].y + dir.y * t));
    }
    if (profile.some((p) => !Number.isFinite(p))) continue;
    let best = 0;
    for (let j = 0; j + 1 < k; j++) best = Math.max(best, Math.abs(profile[j + 1] - profile[j]));
    grads.push(best * perUnit);
  }

  return {
    smoothness,
    textureSd,
    borderSharpness: grads.length ? median(grads) : NaN,
    energy,
    n,
    borderN: grads.length,
    poly: eroded,
  };
}

// ---------- irises ----------

/** Annulus inside the iris and outside the pupil.
 *
 *  The pupil is a near-black disc at the centre of every iris and including it
 *  drags the mean toward black on everyone, which is why this samples a ring
 *  rather than a circle. The inner edge sits at 55% of the iris radius because
 *  a dilated pupil can exceed half of it; on a very dark photograph even that
 *  will clip pupil, which the trimmed mean then drops from the low end.
 *
 *  Pixels are additionally required to fall inside the eroded eye-ring polygon.
 *  Using a vertical band between the lid landmarks would be simpler and would
 *  break on a rolled head, and the polygon also excludes the lash line, which
 *  is darker than any iris. */
function irisSample(data, w, h, P, side, T) {
  const c = P[side === 'R' ? IDX.R_iris : IDX.L_iris];
  const lat = P[side === 'R' ? IDX.R_irisLat : IDX.L_irisLat];
  const med = P[side === 'R' ? IDX.R_irisMed : IDX.L_irisMed];
  const aperture = scalePoly((side === 'R' ? R_EYE_RING : L_EYE_RING).map((i) => P[i]),
    T.irisLidErode);
  // Horizontal ring points only: the top and bottom of the iris sit under the
  // lids on most open eyes, so their landmarks are extrapolated rather than
  // seen.
  const radiusPx = (dist(c, lat) + dist(c, med)) / 2;
  const inner = T.irisInner * radiusPx, outer = T.irisOuter * radiusPx;
  const kept = [];
  let specPx = 0, rawPx = 0;
  const x0 = Math.max(0, Math.floor(c.x - outer)), x1 = Math.min(w - 1, Math.ceil(c.x + outer));
  const y0 = Math.max(0, Math.floor(c.y - outer)), y1 = Math.min(h - 1, Math.ceil(c.y + outer));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - c.x) ** 2 + (y - c.y) ** 2;
      if (d2 < inner * inner || d2 > outer * outer) continue;
      if (!inPoly(x + 0.5, y + 0.5, aperture)) continue;
      const i = (y * w + x) * 4;
      if (!opaque(data, i)) continue;
      rawPx++;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
      // A catchlight sits on almost every iris in almost every portrait, and it
      // is the brightest and least coloured thing in the eye.
      if (lab.L > T.irisSpecL && Math.hypot(lab.a, lab.b) < T.irisSpecC) { specPx++; continue; }
      kept.push({ rgb, lab });
    }
  }
  return { kept, specPx, rawPx, radiusPx, centre: c, inner, outer };
}

/** Coarse colour category.
 *
 *  There is no accepted photographic classification of iris colour. The
 *  clinical scales (Martin-Schultz, Seddon) are physical comparison charts read
 *  by eye, and nothing published maps CIELAB onto them. These cuts are
 *  therefore stated rather than cited, and each is a tunable:
 *
 *    chroma < irisGreyC    neutral: grey, or brown if it is also dark
 *    b* < irisBlueB        blue. Melanin only ever adds yellow and red, so a
 *                          negative mean b* cannot be a pigment effect
 *    hue >= irisGreenHue   green (a* negative, b* positive)
 *    hue < irisGreenHue    warm: brown below irisDarkL, hazel above
 *
 *  White balance moves a* and b* directly, so a tungsten-lit photograph can
 *  walk a blue iris across the b* cut without anything changing about the eye.
 *  chroma and hue are returned beside the category so that can be seen. */
function irisCategory(lab, chroma, hue, T) {
  // A dark AND desaturated sample carries no hue information, and the warm cuts
  // below would hand every such eye to 'brown' purely because L* is low. A
  // blue-grey iris photographed small, lidded or in shadow lands exactly here:
  // one validation portrait sampled at L* 35 with chroma 7 and was called brown
  // on the strength of the L* rule alone. Say so instead of guessing.
  if (chroma < T.irisWeakC && lab.L < T.irisWeakL) return 'indeterminate';
  if (chroma < T.irisGreyC) return lab.L < T.irisDarkL ? 'brown' : 'grey';
  if (lab.b < T.irisBlueB) return 'blue';
  if (hue >= T.irisGreenHue) return 'green';
  return lab.L < T.irisDarkL ? 'brown' : 'hazel';
}

function irisStats(sample, T) {
  const m = trimmedMean(sample.kept, T.trim);
  const base = {
    ok: false, L: NaN, a: NaN, b: NaN, chroma: NaN, hue: NaN,
    hex: null, category: null, radiusPx: sample.radiusPx,
    n: sample.kept.length, specPx: sample.specPx, rawPx: sample.rawPx,
    centre: sample.centre, inner: sample.inner, outer: sample.outer,
  };
  if (!m || sample.kept.length < T.irisMinPx) return base;
  const chroma = Math.hypot(m.a, m.b);
  const hue = (Math.atan2(m.b, m.a) * 180 / Math.PI + 360) % 360;
  return {
    ...base,
    ok: true,
    L: m.L, a: m.a, b: m.b, chroma, hue,
    hex: hexOf(m.rgb),
    category: irisCategory(m, chroma, hue, T),
    n: m.n,
  };
}

/** Agreement between the two eyes.
 *
 *  This is a check on the sampling, not a finding about the subject. True
 *  heterochromia is rare; a large delta-E here is almost always one eye half
 *  closed, one eye in shadow, or a catchlight that survived rejection. Reported
 *  as such so that a caller cannot render it as a discovery. */
function irisAgree(R, L, T) {
  if (!R.ok || !L.ok) {
    return { deltaE: NaN, dL: NaN, dChroma: NaN, sameCategory: false, plausible: false };
  }
  const dE = deltaE({ L: R.L, a: R.a, b: R.b }, { L: L.L, a: L.a, b: L.b });
  return {
    deltaE: dE,
    dL: R.L - L.L,
    dChroma: R.chroma - L.chroma,
    sameCategory: R.category === L.category,
    plausible: dE <= T.irisAgreeMaxDe,
  };
}

// ---------- skin texture ----------

// Geometry copied from skin.js's region layout so the two modules report on the
// same patches of skin. skin.js keeps regionSpecs private, so these are
// separate literals and have to be kept in step by hand.
function skinSpecs(named, P, u) {
  const off = (p, dx, dy) => ({ x: p.x + dx * u, y: p.y + dy * u });
  return [
    { id: 'foreheadC', label: 'Forehead (centre)', c: off(named.glabella, 0, -0.55), r: 0.22 },
    { id: 'cheekR', label: 'Cheek (right)', c: off(P[205] || named.R_zygion, -0.05, 0.12), r: 0.19 },
    { id: 'cheekL', label: 'Cheek (left)', c: off(P[425] || named.L_zygion, 0.05, 0.12), r: 0.19 },
  ];
}

/** High-frequency energy over cheek and forehead: the SD of the luminance
 *  residual after a small blur.
 *
 *  This conflates real skin texture with everything else that lives at the same
 *  spatial frequency — sensor noise, JPEG blocking, sharpening, resampling —
 *  and it cannot tell any of them apart. It runs in the other direction too: a
 *  photograph through a beauty filter, a phone's default skin smoothing, or
 *  heavy noise reduction returns a very low number, and that number says the
 *  image is smooth, not the face. Treat a flattering result on a processed
 *  photograph as a measurement of the processing.
 *
 *  Regional tone is returned alongside because the residual is not independent
 *  of it: the same physical texture produces a smaller L* swing on darker skin,
 *  so the two figures have to be read together. */
function skinTexture(data, w, h, named, P, u, T) {
  const regions = {};
  for (const s of skinSpecs(named, P, u)) {
    const r = s.r * u;
    const plane = discPlane(data, w, h, s.c, r);
    const tone = trimmedMean(discEntries(data, w, h, s.c.x, s.c.y, r), T.trim);
    const px = plane ? plane.n : 0;
    if (!plane || px < T.skinMinPx) {
      regions[s.id] = {
        id: s.id, label: s.label, ok: false, sd: NaN, n: 0,
        L: tone ? tone.L : NaN, a: tone ? tone.a : NaN, b: tone ? tone.b : NaN,
        ita: tone ? ita(tone.L, tone.b) : NaN, px, radiusPx: r, c: s.c,
      };
      continue;
    }
    const { sd, n } = residualSd(plane, Math.max(1, Math.round(T.skinBlurFrac * u)));
    regions[s.id] = {
      id: s.id, label: s.label, ok: Number.isFinite(sd), sd, n,
      L: tone ? tone.L : NaN, a: tone ? tone.a : NaN, b: tone ? tone.b : NaN,
      ita: tone ? ita(tone.L, tone.b) : NaN, px, radiusPx: r, c: s.c,
    };
  }
  const good = Object.values(regions).filter((g) => g.ok);
  const textureEnergy = good.length
    ? good.reduce((s, g) => s + g.sd, 0) / good.length : NaN;
  // Same arbitrary exponential remapping as lips.smoothness, with its own
  // arbitrary constant. Higher means a smaller residual, which is not the same
  // thing as better skin and is frequently the same thing as a filter.
  const evennessPct = Number.isFinite(textureEnergy)
    ? 100 * Math.exp(-textureEnergy / T.skinEnergyScale) : NaN;
  return { textureEnergy, evennessPct, regions };
}

// ---------- entry point ----------

/** Appearance markers for one frontal photograph.
 *
 *  `ctx` is a buildPoints() result; `opts` overrides any key of TUNING. The
 *  returned object is documented at the top of this file. Nothing here is
 *  scored, and warnings[0] always says so. */
export function analyseTexture(ctx, imageEl, opts = {}) {
  const { named, P, imgW, imgH } = ctx;
  const T = { ...TUNING, ...opts };
  const { data } = imagePixels(imageEl, imgW, imgH);
  const u = dist(named.R_pupil, named.L_pupil);
  const { mmPerPx } = mmScale(ctx);
  const warnings = [NO_REFERENCE];

  // --- brows ---
  const browR = browDensity(data, imgW, imgH, P, 'R', u, T, mmPerPx);
  const browL = browDensity(data, imgW, imgH, P, 'L', u, T, mmPerPx);
  const meanCover = (browR.coveredPct + browL.coveredPct) / 2;
  const asymmetryPct = browR.ok && browL.ok && meanCover > 0
    ? Math.abs(browR.coveredPct - browL.coveredPct) / meanCover * 100 : NaN;

  for (const [side, b] of [['right', browR], ['left', browL]]) {
    if (!b.ok && b.sampledPx < T.browMinPx) {
      warnings.push(`The ${side} brow area yielded only ${b.sampledPx} usable pixels, below the ${T.browMinPx} this needs. Nothing is reported for that brow. A larger or less heavily cropped photograph fixes it.`);
    } else if (!b.ok) {
      // The brow polygon itself was fine; what failed is the forehead patch that
      // supplies the local threshold. Reporting this as "too few brow pixels"
      // printed a count that was not below the threshold the sentence named.
      warnings.push(`The ${side} brow filled ${b.sampledPx} pixels, but the forehead patch above it that supplies the local skin reference yielded only ${b.refPx}, so there is no threshold to classify those pixels against and nothing is reported for that brow. The forehead is normally cropped out of frame, covered by hair, or in deep shadow when this happens.`);
    } else if (b.hairPx === 0) {
      warnings.push(`No pixel inside the ${side} brow polygon was darker than the ${b.thresholdL.toFixed(1)} L* threshold taken from the forehead beside it, so its coverage is 0 and its mean hair lightness is not a number. Grey, blonde, sparse and microbladed brows do this, and so does flat frontal lighting. Read the 0 as a failure to separate hair from skin, not as an absent brow.`);
    } else if (!(b.separationL >= T.browMinSeparation)) {
      warnings.push(`The ${side} brow could not be separated from the skin around it: the pixels classified as hair sit only ${b.separationL.toFixed(1)} L* units below the forehead beside them. Grey, blonde and microbladed brows do this, and so does flat frontal lighting. Read that brow's coverage as a floor rather than a measurement.`);
    }
  }

  // --- lips ---
  const lip = lipTexture(data, imgW, imgH, P, u, T);
  if (lip.n < T.lipMinPx) {
    warnings.push(`The vermilion polygon yielded only ${lip.n} usable pixels, below the ${T.lipMinPx} this needs, so lip smoothness and texture SD are not reported — the mouth is too small in this frame to measure its surface. Border sharpness is taken from profiles across the lip edge and is unaffected by that.`);
  }
  if (!Number.isFinite(lip.borderSharpness)) {
    warnings.push('Every profile across the vermilion border ran outside the image, so border sharpness is not reported.');
  }

  // --- irises ---
  const irisR = irisStats(irisSample(data, imgW, imgH, P, 'R', T), T);
  const irisL = irisStats(irisSample(data, imgW, imgH, P, 'L', T), T);
  const agreement = irisAgree(irisR, irisL, T);

  for (const [side, e] of [['right', irisR], ['left', irisL]]) {
    // The specular fraction is tested whether or not the eye survived. Glare
    // large enough to starve the sample below irisMinPx is the case this
    // warning describes best, and behind an `else` it was the one case that
    // never reached it - the eye was blamed on framing instead.
    const specFrac = e.rawPx ? e.specPx / e.rawPx : 0;
    const specPct = Math.round(specFrac * 100);
    if (!e.ok) {
      warnings.push(`The ${side} iris annulus yielded only ${e.n} usable pixels, below the ${T.irisMinPx} this needs. No colour is reported for that eye. ${specFrac > T.irisSpecMaxFrac
        ? `${specPct}% of the ${e.rawPx} pixels tested were thrown out as specular highlight, so this is glare rather than framing.`
        : 'This is normally a closed or heavily lidded eye, or an iris too small in frame to sample between pupil and limbus.'}`);
    } else if (specFrac > T.irisSpecMaxFrac) {
      warnings.push(`${specPct}% of the ${side} iris was discarded as specular highlight. A catchlight that large leaves little iris behind it, so treat that eye's colour as indicative.`);
    }
  }
  if (irisR.ok && irisL.ok && !agreement.plausible) {
    warnings.push(`The two irises differ by ΔE ${agreement.deltaE.toFixed(1)} in mean L*a*b*. Heterochromia is rare and this is nearly always a sampling failure — a catchlight, a half-closed lid, or one eye in shadow. Treat both colours as unreliable rather than reading a difference into them.`);
  }

  // --- skin ---
  const skin = skinTexture(data, imgW, imgH, named, P, u, T);
  for (const g of Object.values(skin.regions)) {
    if (!g.ok) {
      warnings.push(`${g.label} yielded only ${g.px} usable pixels, below the ${T.skinMinPx} this needs, so it is left out of the texture figure.`);
    }
  }

  // Same left/right cheek test skin.js gates its colour findings on. Directional
  // light moves texture energy and the brow threshold together, so it is worth
  // repeating here rather than assuming the caller ran both modules.
  const cR = skin.regions.cheekR, cL = skin.regions.cheekL;
  const lightAsym = Math.abs(cR.L - cL.L);
  if (lightAsym > T.lightAsymL) {
    warnings.push(`The two cheeks differ by ${lightAsym.toFixed(1)} L* units, so the face is lit from one side. Texture energy rises on the lit side and falls into shadow, and the brow threshold follows the local skin with it, so the left-right figures above are partly a measurement of the lighting.`);
  }

  const minDim = Math.min(imgW, imgH);
  if (minDim >= T.filterMinDim && Number.isFinite(skin.textureEnergy)
    && skin.textureEnergy < T.filterEnergy) {
    warnings.push(`Skin texture energy is ${skin.textureEnergy.toFixed(2)} L* units on a ${imgW}×${imgH} image, which is lower than unprocessed skin produces at this resolution. Beauty-mode capture, portrait smoothing and heavy noise reduction all land here. If the photograph was processed, every figure in this section describes the processing rather than the face. Both cut-offs behind this warning are arbitrary and are exposed as tunables.`);
  }

  return {
    brows: { R: browR, L: browL, asymmetryPct },
    lips: {
      smoothness: lip.smoothness,
      textureSd: lip.textureSd,
      borderSharpness: lip.borderSharpness,
    },
    irises: { R: irisR, L: irisL, agreement },
    skin,
    warnings,
  };
}
