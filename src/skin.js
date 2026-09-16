// Regional skin colourimetry in CIELAB.
//
// What this can and cannot do:
//   CAN  compare one region of the face against another in the same photo -
//        under-eye vs cheek, nose vs forehead, left vs right. Within a single
//        exposure these contrasts are meaningful.
//   CANNOT give absolute, camera-independent colour. Phone cameras apply
//        auto white balance, tone curves and beauty processing. Absolute L*
//        and ITA are therefore indicative only, and are labelled as such.
//
// Regions are sampled as discs scaled to the face, and are drawn on the
// overlay so you can see exactly which pixels produced each number.

import { mid, dist } from './geom.js';
import { IDX } from './landmarks.js';

// ---------- colour conversion ----------
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function rgbToLab(r, g, b) {
  const R = srgbToLinear(r / 255), G = srgbToLinear(g / 255), B = srgbToLinear(b / 255);
  // sRGB D65
  let X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  let Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  X /= 0.95047; Y /= 1.00000; Z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Individual Typology Angle — the dermatological skin-tone scale used for
 *  phototype classification and laser dosing. */
export function ita(L, b) {
  if (!Number.isFinite(L) || !Number.isFinite(b) || Math.abs(b) < 1e-6) return NaN;
  return Math.atan((L - 50) / b) * 180 / Math.PI;
}

export function itaClass(v) {
  if (!Number.isFinite(v)) return '—';
  if (v > 55) return 'Very light';
  if (v > 41) return 'Light';
  if (v > 28) return 'Intermediate';
  if (v > 10) return 'Tan';
  if (v > -30) return 'Brown';
  return 'Dark';
}

// ---------- sampling ----------
function sampleDisc(data, w, h, cx, cy, r) {
  const px = [];
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * w + x) * 4;
      if (data[i + 3] < 200) continue;
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return px;
}

/** Trimmed statistics: drop the darkest and lightest 15% so stray hairs,
 *  specular highlights and shadow edges do not drive the mean. */
function robustLab(pixels) {
  if (pixels.length < 12) return null;
  const labs = pixels.map(([r, g, b]) => rgbToLab(r, g, b));
  const sorted = [...labs].sort((p, q) => p.L - q.L);
  const cut = Math.floor(sorted.length * 0.15);
  const core = sorted.slice(cut, sorted.length - cut);
  if (!core.length) return null;
  const mean = core.reduce((s, p) => ({ L: s.L + p.L, a: s.a + p.a, b: s.b + p.b }), { L: 0, a: 0, b: 0 });
  const n = core.length;
  const m = { L: mean.L / n, a: mean.a / n, b: mean.b / n };
  const varL = core.reduce((s, p) => s + (p.L - m.L) ** 2, 0) / n;
  return { ...m, sdL: Math.sqrt(varL), n: core.length, nRaw: pixels.length };
}

export const deltaE = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

/** Sample-region layout, defined relative to the landmarks so it scales with
 *  the face and follows head roll. */
function regionSpecs(named, P, u) {
  const R = (x, y) => ({ x, y });
  const off = (p, dx, dy) => R(p.x + dx * u, p.y + dy * u);
  const eyeR = named.R_lidLower, eyeL = named.L_lidLower;
  return [
    { id: 'foreheadC', label: 'Forehead (centre)', c: off(named.glabella, 0, -0.55), r: 0.22 },
    { id: 'foreheadR', label: 'Forehead (right)', c: off(named.glabella, -0.55, -0.45), r: 0.16 },
    { id: 'foreheadL', label: 'Forehead (left)', c: off(named.glabella, 0.55, -0.45), r: 0.16 },
    { id: 'infraR', label: 'Under-eye (right)', c: off(eyeR, 0.02, 0.20), r: 0.10, kind: 'infra' },
    { id: 'infraL', label: 'Under-eye (left)', c: off(eyeL, -0.02, 0.20), r: 0.10, kind: 'infra' },
    { id: 'cheekR', label: 'Cheek (right)', c: off(P[205] || named.R_zygion, -0.05, 0.12), r: 0.19, kind: 'cheek' },
    { id: 'cheekL', label: 'Cheek (left)', c: off(P[425] || named.L_zygion, 0.05, 0.12), r: 0.19, kind: 'cheek' },
    { id: 'noseDorsum', label: 'Nasal dorsum', c: off(named.rhinion, 0, 0.10), r: 0.11 },
    { id: 'noseTip', label: 'Nose tip', c: off(named.pronasale, 0, 0), r: 0.10 },
    { id: 'chin', label: 'Chin', c: off(named.pogonion, 0, -0.10), r: 0.15 },
    { id: 'jawR', label: 'Jawline (right)', c: off(named.R_gonionApprox, 0.22, -0.20), r: 0.12 },
    { id: 'jawL', label: 'Jawline (left)', c: off(named.L_gonionApprox, -0.22, -0.20), r: 0.12 },
  ];
}

export function analyseSkin(ctx, imageEl, opts = {}) {
  const { named, P, imgW, imgH } = ctx;
  const cv = document.createElement('canvas');
  cv.width = imgW; cv.height = imgH;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(imageEl, 0, 0, imgW, imgH);
  const img = g.getImageData(0, 0, imgW, imgH);

  const u = dist(named.R_pupil, named.L_pupil);   // interpupillary unit
  const specs = regionSpecs(named, P, u);

  const regions = {};
  for (const s of specs) {
    const r = s.r * u;
    const stats = robustLab(sampleDisc(img.data, imgW, imgH, s.c.x, s.c.y, r));
    regions[s.id] = stats ? { ...s, r, ...stats, ita: ita(stats.L, stats.b) } : { ...s, r, missing: true };
  }

  const ok = Object.values(regions).filter((r) => !r.missing);
  const medianOf = (key) => {
    const v = ok.map((r) => r[key]).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : NaN;
  };
  const faceMedian = { L: medianOf('L'), a: medianOf('a'), b: medianOf('b') };

  const findings = [];
  const g_ = (id) => regions[id];

  // --- periorbital darkness ---
  for (const side of ['R', 'L']) {
    const infra = g_(`infra${side}`), cheek = g_(`cheek${side}`);
    if (infra?.missing || cheek?.missing) continue;
    const dL = cheek.L - infra.L;            // >0 => under-eye darker
    const da = infra.a - cheek.a;            // >0 => redder/more vascular
    const db = cheek.b - infra.b;            // >0 => under-eye less yellow (bluish)
    const dE = deltaE(infra, cheek);
    let type = 'none';
    if (dL > 2.5) type = db > 1.2 && da > 0.4 ? 'vascular' : (infra.b < cheek.b ? 'vascular' : 'pigmented');
    findings.push({
      id: `periorbital${side}`, side,
      label: `Under-eye contrast (${side === 'R' ? 'right' : 'left'})`,
      dL, da, db, dE, type,
      severity: dL < 2.5 ? 'none' : dL < 5 ? 'mild' : dL < 8 ? 'moderate' : 'marked',
    });
  }

  // --- erythema by region, relative to the face median ---
  for (const id of ['cheekR', 'cheekL', 'noseTip', 'noseDorsum', 'chin', 'foreheadC']) {
    const r = g_(id); if (!r || r.missing) continue;
    const da = r.a - faceMedian.a;
    if (da > 1.2) {
      findings.push({
        id: `erythema-${id}`, label: `Redness — ${r.label}`, da,
        severity: da < 2.5 ? 'mild' : da < 4.5 ? 'moderate' : 'marked',
      });
    }
  }

  // --- tone evenness ---
  const sdAcross = (() => {
    const v = ok.map((r) => r.L);
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
  })();
  const localSd = ok.reduce((s, r) => s + r.sdL, 0) / (ok.length || 1);

  // --- lighting validity gate ---
  const lightAsym = (g_('cheekR')?.missing || g_('cheekL')?.missing)
    ? NaN : Math.abs(g_('cheekR').L - g_('cheekL').L);
  const foreheadAsym = (g_('foreheadR')?.missing || g_('foreheadL')?.missing)
    ? NaN : Math.abs(g_('foreheadR').L - g_('foreheadL').L);

  const warnings = [];
  if (lightAsym > 6 || foreheadAsym > 6) {
    warnings.push(`Lighting is directional: the two sides of the face differ by ${Math.max(lightAsym, foreheadAsym).toFixed(1)} L* units. Anything below about that difference in the findings above is shading, not skin. Re-shoot facing a window or with even light on both sides.`);
  }
  const cheekMean = (g_('cheekR')?.L + g_('cheekL')?.L) / 2;
  if (cheekMean > 88) warnings.push('The photo is close to clipping white on the cheeks. Overexposure flattens texture and erases redness — reshoot around one stop darker.');
  if (cheekMean < 25) warnings.push('The photo is very underexposed, which exaggerates every dark region including the under-eyes.');

  const skinTone = (() => {
    const base = [g_('cheekR'), g_('cheekL'), g_('foreheadC')].filter((r) => r && !r.missing);
    if (!base.length) return null;
    const L = base.reduce((s, r) => s + r.L, 0) / base.length;
    const a = base.reduce((s, r) => s + r.a, 0) / base.length;
    const b = base.reduce((s, r) => s + r.b, 0) / base.length;
    const v = ita(L, b);
    return { L, a, b, ita: v, cls: itaClass(v) };
  })();

  return { regions, specs, faceMedian, findings, warnings, skinTone, sdAcross, localSd, lightAsym, foreheadAsym };
}
