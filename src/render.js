// Overlay drawing. Every metric knows how to draw its own construction, so
// hovering a row in the report shows you precisely which pixels produced it.

import { IDX, FACE_OVAL_ORDERED, JAW_ORDERED, R_EYE_RING, L_EYE_RING } from './landmarks.js';
import { mid, dist, sub, projectOnLine } from './geom.js';

// Warm, desaturated overlay palette. Canvas cannot resolve light-dark(), so
// these are literal values chosen to hold up over photographic mid-tones in
// either theme: opaque enough to read on a bright cheek, warm enough to sit
// inside the editorial palette rather than float above it.
export const COL = {
  base: 'rgba(243,237,224,0.62)',  // warm translucent cream
  hi: '#c69a5b',                   // muted amber / tan
  hi2: '#7fa878',                  // muted sage green
  warn: '#c2685c',                 // muted brick red
  mute: 'rgba(243,237,224,0.38)',  // low-opacity cream
  ink: '#1a1917',                  // warm near-black
};

function lineStyle(g, color, w, dash = null) {
  g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []);
  g.lineCap = 'round'; g.lineJoin = 'round';
}

const seg = (g, a, b) => { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };

function poly(g, pts, close = false) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  if (close) g.closePath();
  g.stroke();
}

function dotAt(g, p, r, fill) {
  g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
}

/** Horizontal rule across the face at height y. */
function hRule(g, R, y, color, w = 2, dash = [7, 6]) {
  const x0 = R.bounds.x0 - R.u * 0.25, x1 = R.bounds.x1 + R.u * 0.25;
  lineStyle(g, color, w, dash);
  seg(g, { x: x0, y }, { x: x1, y });
}

function vRule(g, R, x, color, w = 2, dash = [7, 6]) {
  const y0 = R.bounds.y0 - R.u * 0.2, y1 = R.bounds.y1 + R.u * 0.2;
  lineStyle(g, color, w, dash);
  seg(g, { x, y: y0 }, { x, y: y1 });
}

/** A measured span with end ticks. */
function span(g, a, b, color, label, R, side = 1) {
  lineStyle(g, color, 3);
  seg(g, a, b);
  const n = { x: -(b.y - a.y), y: b.x - a.x };
  const l = Math.hypot(n.x, n.y) || 1;
  const t = { x: n.x / l * R.u * 0.035, y: n.y / l * R.u * 0.035 };
  seg(g, { x: a.x - t.x, y: a.y - t.y }, { x: a.x + t.x, y: a.y + t.y });
  seg(g, { x: b.x - t.x, y: b.y - t.y }, { x: b.x + t.x, y: b.y + t.y });
  if (label) drawLabel(g, mid(a, b), label, color, R, side);
}

function drawLabel(g, p, text, color, R, side = 1) {
  // Garamond runs small on the body, so the serif stack gets ~15% more size.
  const fs = Math.max(11, R.u * 0.115) * 1.15;
  g.font = `600 ${fs}px "EB Garamond", Garamond, Georgia, serif`;
  const w = g.measureText(text).width;
  const pad = fs * 0.35;
  const x = p.x - w / 2, y = p.y + side * fs * 1.15;
  g.fillStyle = 'rgba(26,25,23,0.82)';
  g.beginPath();
  const rr = 2;
  const bx = x - pad, by = y - fs * 0.85, bw = w + pad * 2, bh = fs * 1.2;
  g.moveTo(bx + rr, by); g.arcTo(bx + bw, by, bx + bw, by + bh, rr);
  g.arcTo(bx + bw, by + bh, bx, by + bh, rr); g.arcTo(bx, by + bh, bx, by, rr);
  g.arcTo(bx, by, bx + bw, by, rr); g.closePath(); g.fill();
  g.fillStyle = color; g.fillText(text, x, y);
}

/** Arc showing an interior angle at b. */
function angleArc(g, a, b, c, color, label, R) {
  const r = R.u * 0.30;
  const a1 = Math.atan2(a.y - b.y, a.x - b.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  lineStyle(g, color, 2.5);
  g.beginPath(); g.arc(b.x, b.y, r, a1, a1 + d, d < 0); g.stroke();
  lineStyle(g, color, 2, [5, 5]);
  seg(g, b, a); seg(g, b, c);
  if (label) {
    const am = a1 + d / 2;
    drawLabel(g, { x: b.x + Math.cos(am) * r * 1.55, y: b.y + Math.sin(am) * r * 1.55 }, label, color, R, 0);
  }
}

// ---------- base layers ----------
export const LAYERS = {
  mesh: {
    label: 'Landmark mesh',
    draw(g, R) {
      g.fillStyle = 'rgba(243,237,224,0.55)';
      for (let i = 0; i < R.A.P.length; i++) {
        if (i >= 468) continue;
        const p = R.A.P[i];
        g.fillRect(p.x - 0.7, p.y - 0.7, 1.4, 1.4);
      }
    },
  },
  outline: {
    label: 'Feature outlines',
    draw(g, R) {
      lineStyle(g, COL.base, 1.8);
      poly(g, FACE_OVAL_ORDERED.map((i) => R.A.P[i]), true);
      poly(g, R_EYE_RING.map((i) => R.A.P[i]), true);
      poly(g, L_EYE_RING.map((i) => R.A.P[i]), true);
      poly(g, [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146].map((i) => R.A.P[i]), true);
      poly(g, [70, 63, 105, 66, 107].map((i) => R.A.P[i]));
      poly(g, [300, 293, 334, 296, 336].map((i) => R.A.P[i]));
      poly(g, [168, 6, 197, 195, 5, 4, 1, 2].map((i) => R.A.P[i]));
      for (const i of [IDX.R_alare, IDX.L_alare, IDX.R_iris, IDX.L_iris]) dotAt(g, R.A.P[i], 2.2, COL.base);
    },
  },
  midline: {
    label: 'Midsagittal axis',
    draw(g, R) {
      vRule(g, R, R.res.symmetry.axisX, 'rgba(198,154,91,0.85)', 2, [10, 7]);
    },
  },
  thirds: {
    label: 'Facial thirds',
    draw(g, R) {
      const n = R.A.named;
      for (const y of [R.res.trichion.y, n.glabella.y, n.subnasale.y, n.menton.y]) {
        hRule(g, R, y, 'rgba(127,168,120,0.85)');
      }
      const d = R.res.metrics.thirdsBalance.detail;
      const xs = R.bounds.x1 + R.u * 0.1;
      const mids = [
        [(R.res.trichion.y + n.glabella.y) / 2, d.upperPct],
        [(n.glabella.y + n.subnasale.y) / 2, d.middlePct],
        [(n.subnasale.y + n.menton.y) / 2, d.lowerPct],
      ];
      for (const [y, pct] of mids) drawLabel(g, { x: xs, y }, `${pct.toFixed(1)}%`, COL.hi2, R, 0);
    },
  },
  fifths: {
    label: 'Facial fifths',
    draw(g, R) {
      for (const x of R.res.fifthBounds) vRule(g, R, x, 'rgba(122,146,168,0.82)', 2, [6, 6]);
      R.res.fifths.forEach((f, i) => {
        const x = (R.res.fifthBounds[i] + R.res.fifthBounds[i + 1]) / 2;
        const off = f.devPct;
        drawLabel(g, { x, y: R.res.eyeY - R.u * 0.55 },
          `${off >= 0 ? '+' : ''}${off.toFixed(0)}%`,
          Math.abs(off) > 12 ? COL.warn : '#9fb4c8', R, 0);
      });
    },
  },
  symmetry: {
    label: 'Mirror comparison',
    draw(g, R) {
      const ax = R.res.symmetry.axisX;
      const pairs = [[33, 263], [133, 362], [159, 386], [145, 374], [129, 358],
        [61, 291], [172, 397], [105, 334], [234, 454], [98, 327]];
      for (const [r, l] of pairs) {
        const pr = R.A.P[r], pl = R.A.P[l];
        const m = { x: 2 * ax - pr.x, y: pr.y };
        lineStyle(g, 'rgba(194,104,92,0.9)', 2);
        seg(g, m, pl);
        dotAt(g, m, 2.6, 'rgba(194,104,92,0.9)');
        dotAt(g, pl, 2.6, COL.hi2);
      }
    },
  },
  skin: {
    label: 'Skin sample regions',
    draw(g, R) {
      if (!R.skin) return;
      for (const s of Object.values(R.skin.regions)) {
        if (s.missing) continue;
        g.beginPath(); g.arc(s.c.x, s.c.y, s.r, 0, Math.PI * 2);
        lineStyle(g, 'rgba(243,237,224,0.8)', 1.6, [4, 4]); g.stroke();
      }
    },
  },
};

// ---------- per-metric constructions ----------
export const DRAWERS = {
  canthalTilt(g, R) {
    const n = R.A.named;
    for (const [a, b] of [[n.R_canthusMed, n.R_canthusLat], [n.L_canthusMed, n.L_canthusLat]]) {
      lineStyle(g, COL.hi, 3); seg(g, a, b);
      lineStyle(g, COL.mute, 2, [5, 5]);
      seg(g, a, { x: b.x, y: a.y });
      dotAt(g, a, 3, COL.hi); dotAt(g, b, 3, COL.hi);
    }
    const d = R.res.metrics.canthalTilt.detail;
    drawLabel(g, n.R_canthusLat, `${d.right >= 0 ? '+' : ''}${d.right.toFixed(1)}°`, COL.hi, R, -1);
    drawLabel(g, n.L_canthusLat, `${d.left >= 0 ? '+' : ''}${d.left.toFixed(1)}°`, COL.hi, R, -1);
  },
  intercanthalMm(g, R) {
    const n = R.A.named;
    span(g, n.R_canthusMed, n.L_canthusMed, COL.hi, `${R.res.metrics.intercanthalMm.value.toFixed(1)}mm`, R, -1);
  },
  icdOverPfl(g, R) {
    const n = R.A.named;
    span(g, n.R_canthusMed, n.L_canthusMed, COL.hi, 'ICD', R, -1);
    span(g, n.R_canthusLat, n.R_canthusMed, COL.hi2, 'eye', R, 1);
    span(g, n.L_canthusMed, n.L_canthusLat, COL.hi2, 'eye', R, 1);
  },
  pflMm(g, R) {
    const n = R.A.named;
    const d = R.res.metrics.pflMm.detail;
    span(g, n.R_canthusLat, n.R_canthusMed, COL.hi, `${d.right.toFixed(1)}mm`, R, 1);
    span(g, n.L_canthusMed, n.L_canthusLat, COL.hi, `${d.left.toFixed(1)}mm`, R, 1);
  },
  pfhMm(g, R) {
    const d = R.res.metrics.pfhMm.detail;
    span(g, R.A.P[159], R.A.P[145], COL.hi, `${d.right.toFixed(1)}mm`, R, 1);
    span(g, R.A.P[386], R.A.P[374], COL.hi, `${d.left.toFixed(1)}mm`, R, 1);
  },
  pfhOverPfl(g, R) { DRAWERS.pfhMm(g, R); DRAWERS.pflMm(g, R); },
  ipdMm(g, R) {
    const n = R.A.named;
    span(g, n.R_pupil, n.L_pupil, COL.hi, `${R.res.metrics.ipdMm.value.toFixed(1)}mm`, R, -1);
    for (const p of [n.R_pupil, n.L_pupil]) {
      lineStyle(g, COL.hi2, 2); g.beginPath();
      g.arc(p.x, p.y, R.res.scale.irisPx / 2, 0, Math.PI * 2); g.stroke();
    }
  },
  browApexPos(g, R) {
    const n = R.A.named;
    for (const s of ['R', 'L']) {
      const apex = R.res.apex[s];
      const inner = s === 'R' ? n.R_canthusMed : n.L_canthusMed;
      const outer = s === 'R' ? n.R_canthusLat : n.L_canthusLat;
      lineStyle(g, COL.mute, 2, [4, 4]); seg(g, inner, outer);
      lineStyle(g, COL.hi, 3); seg(g, { x: apex.p.x, y: inner.y }, apex.p);
      dotAt(g, apex.p, 3.4, COL.hi);
      drawLabel(g, apex.p, apex.f.toFixed(2), COL.hi, R, -1);
    }
  },
  browEyeMm(g, R) {
    const d = R.res.metrics.browEyeMm.detail;
    span(g, R.A.P[105], R.A.P[159], COL.hi, `${d.right.toFixed(1)}mm`, R, 0);
    span(g, R.A.P[334], R.A.P[386], COL.hi, `${d.left.toFixed(1)}mm`, R, 0);
  },
  nasalWidthMm(g, R) {
    const n = R.A.named;
    span(g, n.R_alare, n.L_alare, COL.hi, `${R.res.metrics.nasalWidthMm.value.toFixed(1)}mm`, R, 1);
  },
  nasalIndex(g, R) {
    const n = R.A.named;
    span(g, n.R_alare, n.L_alare, COL.hi, 'width', R, 1);
    span(g, n.nasion, n.subnasale, COL.hi2, 'height', R, 0);
  },
  alarOverIcd(g, R) {
    const n = R.A.named;
    span(g, n.R_alare, n.L_alare, COL.hi, 'alar', R, 1);
    span(g, n.R_canthusMed, n.L_canthusMed, COL.hi2, 'ICD', R, -1);
    lineStyle(g, COL.mute, 2, [4, 4]);
    seg(g, n.R_canthusMed, { x: n.R_canthusMed.x, y: n.R_alare.y });
    seg(g, n.L_canthusMed, { x: n.L_canthusMed.x, y: n.L_alare.y });
  },
  noseOverMouth(g, R) {
    const n = R.A.named;
    span(g, n.R_alare, n.L_alare, COL.hi, 'nose', R, -1);
    span(g, n.R_cheilion, n.L_cheilion, COL.hi2, 'mouth', R, 1);
  },
  mouthWidthMm(g, R) {
    const n = R.A.named;
    span(g, n.R_cheilion, n.L_cheilion, COL.hi, `${R.res.metrics.mouthWidthMm.value.toFixed(1)}mm`, R, 1);
  },
  vermilionRatio(g, R) {
    const n = R.A.named;
    const d = R.res.metrics.vermilionRatio.detail;
    span(g, n.labialeSuperius, n.stomionSup, COL.hi, `${d.upperMm.toFixed(1)}mm`, R, 0);
    span(g, n.stomionInf, n.labialeInferius, COL.hi2, `${d.lowerMm.toFixed(1)}mm`, R, 0);
  },
  vermilionOverLower3(g, R) {
    const n = R.A.named;
    span(g, n.labialeSuperius, n.labialeInferius, COL.hi, 'lips', R, 0);
    span(g, n.subnasale, n.menton, COL.hi2, 'lower third', R, 0);
  },
  philtrumMm(g, R) {
    const n = R.A.named;
    span(g, n.subnasale, n.labialeSuperius, COL.hi, `${R.res.metrics.philtrumMm.value.toFixed(1)}mm`, R, 0);
  },
  philtrumOverChin(g, R) {
    const n = R.A.named;
    span(g, n.subnasale, n.labialeSuperius, COL.hi, 'philtrum', R, 0);
    span(g, n.stomion, n.menton, COL.hi2, 'chin', R, 0);
  },
  facialIndex(g, R) {
    const n = R.A.named;
    span(g, n.nasion, n.menton, COL.hi, 'height', R, 0);
    span(g, R.res.silhouette.a, R.res.silhouette.b, COL.hi2, 'width', R, -1);
  },
  fwhr(g, R) {
    const n = R.A.named;
    const browY = Math.min(R.A.P[105].y, R.A.P[334].y);
    span(g, R.res.silhouette.a, R.res.silhouette.b, COL.hi, 'width', R, -1);
    span(g, { x: n.labialeSuperius.x, y: browY }, n.labialeSuperius, COL.hi2, 'height', R, 0);
  },
  bigonialOverBizygo(g, R) {
    span(g, R.res.silhouette.a, R.res.silhouette.b, COL.hi2, 'cheekbone', R, -1);
    span(g, R.res.gonia.R.p, R.res.gonia.L.p, COL.hi, 'jaw', R, 1);
  },
  jawAngleSharpness(g, R) {
    const poly_ = JAW_ORDERED.map((i) => R.A.P[i]);
    lineStyle(g, COL.base, 2.5); poly(g, poly_);
    for (const s of ['R', 'L']) {
      const go = R.res.gonia[s];
      dotAt(g, go.p, 4.5, COL.hi);
      const i = JAW_ORDERED.indexOf(go.idx);
      if (i > 1 && i < JAW_ORDERED.length - 2) {
        angleArc(g, poly_[i - 2], go.p, poly_[i + 2], COL.hi, `${go.angle.toFixed(0)}°`, R);
      }
    }
  },
  thirdsBalance(g, R) { LAYERS.thirds.draw(g, R); },
  lowerThirdRatio(g, R) {
    const n = R.A.named;
    span(g, n.subnasale, n.stomion, COL.hi, 'upper', R, 0);
    span(g, n.stomion, n.menton, COL.hi2, 'lower', R, 0);
  },
  symmetryRms(g, R) { LAYERS.symmetry.draw(g, R); LAYERS.midline.draw(g, R); },
  midfaceRatio(g, R) {
    const n = R.A.named;
    span(g, n.R_pupil, n.L_pupil, COL.hi, 'IPD', R, -1);
    span(g, { x: n.labialeSuperius.x, y: R.res.eyeY }, n.labialeSuperius, COL.hi2, 'midface', R, 0);
  },
  eyeSeparationRatio(g, R) {
    const n = R.A.named;
    span(g, n.R_pupil, n.L_pupil, COL.hi, 'IPD', R, -1);
    span(g, R.res.silhouette.a, R.res.silhouette.b, COL.hi2, 'face width', R, 1);
  },
};

/** Render the overlay. `highlight` is a metric id or null. */
export function renderOverlay(canvas, R, { layers, highlight }) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.save();
  // Draw in the aligned frame, then rotate the whole overlay back onto the photo.
  g.translate(R.rotO.x, R.rotO.y);
  g.rotate(-R.rotTheta);
  g.translate(-R.rotO.x, -R.rotO.y);

  for (const [id, layer] of Object.entries(LAYERS)) {
    if (!layers[id]) continue;
    if (id === 'skin') continue;      // skin discs live in raw image space
    g.save(); layer.draw(g, R); g.restore();
  }
  if (highlight && DRAWERS[highlight]) {
    g.save();
    g.shadowColor = 'rgba(26,25,23,0.85)'; g.shadowBlur = 6;
    DRAWERS[highlight](g, R);
    g.restore();
  }
  g.restore();

  if (layers.skin && R.skin) { g.save(); LAYERS.skin.draw(g, R); g.restore(); }
}
