// Vector / geometry primitives. All points are {x,y} in pixels unless noted.

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
export const centroid = (pts) => {
  const s = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / pts.length, y: s.y / pts.length };
};

export const DEG = 180 / Math.PI;

/** Interior angle at vertex b, formed by a-b-c. Always in [0,180]. */
export function angleAt(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const d = dot(u, v) / ((len(u) * len(v)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, d))) * DEG;
}

/** Signed angle of vector a->b measured from +x axis, CCW positive in math
 *  coords. Image y grows downward, so we negate y to get intuitive signs
 *  (a point higher on the image yields a positive angle). */
export function tiltDeg(a, b) {
  return Math.atan2(-(b.y - a.y), b.x - a.x) * DEG;
}

/** Tilt of a bilateral feature, measured from its medial to its lateral end.
 *  Positive means the lateral end sits higher on the face.
 *
 *  Do NOT use tiltDeg() for this. On the subject's right side the medial to
 *  lateral vector points in -x, so atan2 returns something near 180 degrees
 *  rather than a small angle, and negating it does not recover the tilt - it
 *  produces roughly -180. Taking |dx| makes the measurement independent of
 *  which side of the face it is on. */
export function bilateralTiltDeg(medial, lateral) {
  return Math.atan2(medial.y - lateral.y, Math.abs(lateral.x - medial.x)) * DEG;
}

/** Smallest angle between two undirected lines, in [0,90]. */
export function lineAngle(p1, p2, q1, q2) {
  let t = Math.abs(tiltDeg(p1, p2) - tiltDeg(q1, q2)) % 180;
  if (t > 90) t = 180 - t;
  return t;
}

/** Signed perpendicular distance from p to the infinite line a->b.
 *  Positive when p lies to the left of a->b in image coords. */
export function signedDistToLine(p, a, b) {
  const d = sub(b, a);
  const l = len(d) || 1;
  return cross(d, sub(p, a)) / l;
}

export const distToLine = (p, a, b) => Math.abs(signedDistToLine(p, a, b));

/** Project p onto the infinite line a->b. */
export function projectOnLine(p, a, b) {
  const d = sub(b, a);
  const t = dot(sub(p, a), d) / (dot(d, d) || 1);
  return { x: a.x + d.x * t, y: a.y + d.y * t, t };
}

/** Reflect p across the infinite line through a with unit direction u. */
export function reflectAcross(p, a, u) {
  const v = sub(p, a);
  const d = dot(v, u);
  const proj = { x: u.x * d, y: u.y * d };
  return { x: a.x + 2 * proj.x - v.x, y: a.y + 2 * proj.y - v.y };
}

/** Total least squares (orthogonal) line fit. Returns a point on the line and
 *  a unit direction vector. Used for the midsagittal axis, where ordinary
 *  least squares would be wrong: the residual we care about is perpendicular
 *  to the line, not vertical. */
export function fitLine(pts) {
  const c = centroid(pts);
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p.x - c.x, dy = p.y - c.y;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  // Principal eigenvector of the 2x2 covariance matrix.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { point: c, dir: { x: Math.cos(theta), y: Math.sin(theta) } };
}

/** Point on a polyline (list of points) closest to `p`. */
export function nearestOnPolyline(p, poly) {
  let best = null;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const d = sub(b, a);
    let t = dot(sub(p, a), d) / (dot(d, d) || 1);
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + d.x * t, y: a.y + d.y * t };
    const dd = dist(p, q);
    if (!best || dd < best.d) best = { d: dd, p: q, seg: i };
  }
  return best;
}

/** Turn angle of the polyline at index i, using neighbours `span` apart.
 *  180 = straight, smaller = sharper corner. */
export function contourAngle(poly, i, span = 3) {
  const n = poly.length;
  const a = poly[Math.max(0, i - span)], b = poly[i], c = poly[Math.min(n - 1, i + span)];
  return angleAt(a, b, c);
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round = (v, n = 1) => {
  const f = 10 ** n;
  return Math.round(v * f) / f;
};
