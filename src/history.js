// Progress tracking: the same face, the same pipeline, two dates.
//
// This is the most defensible comparison the tool can make, and the reason is
// arithmetic rather than optimism. Every systematic error documented elsewhere
// in this codebase is a fixed offset on a given measurement: the mesh's lateral
// canthus sits roughly 2mm medial to the anatomical point, so eye width reads
// about 13% short on everyone; iris-calibrated millimetres ran about 8% below
// published means across the validation portraits; the facial index reads low
// because a photographic silhouette is not a caliper; the reference samples are
// predominantly European. Subtract two measurements taken by the same pipeline
// on the same face and every one of those terms cancels. What survives is the
// change.
//
// The consequence is that a number which cannot honestly be SCORED can still be
// TRACKED. Seventeen of the twenty-seven frontal measurements are shown without
// a verdict because the published reference does not describe what the mesh
// measures; all twenty-seven have a usable delta.
//
// What does not cancel is the photograph. Pitch, yaw, focal length, lighting and
// expression differ between two sittings and move these numbers more than most
// anatomy does. That is why every diff reports the pose difference alongside the
// changes, and why nothing here is called meaningful on the strength of its size
// alone.
//
// WHAT IS STORED, AND WHAT IS NOT. A snapshot holds metric values, the tally,
// pose, scale, and an optional label and note. It never holds the image, or
// anything from which the image could be reconstructed. The entire claim of this
// tool is that the photograph does not persist and does not leave the machine;
// quietly parking a copy in localStorage would make that claim false while it
// still appeared on the page. Entries are therefore BUILT from a whitelist of
// known fields rather than filtered, so a caller cannot attach a data URL by
// accident.

import { NORMS, PROFILE_NORMS, refFor } from './norms.js';
import { round } from './geom.js';

export const STORAGE_KEY = 'prosopon.history.v1';

/** Snapshots kept before the oldest is evicted. Sized so that a monthly
 *  photograph for five years fits, while the serialised store stays far below
 *  the ~5MB localStorage budget shared with everything else on the origin. */
export const HISTORY_LIMIT = 60;

/** Floors a change has to clear before it is called `meaningful`.
 *
 *  THESE ARE A JUDGEMENT CALL, NOT A MEASURED REPEATABILITY LIMIT. No
 *  repeat-photograph study has been run on this pipeline, so the within-subject
 *  noise of any of these measurements is unknown. The floors are set where they
 *  are because the pipeline's documented nuisance terms — pitch estimated to
 *  about ±3°, the iris scale's own ±0.5mm standard deviation, expression, lens
 *  distance — move most of these numbers by a few percent between two sittings
 *  of an unchanged face, and a floor below that reports noise as progress.
 *  Treat them as tunables: given a set of repeat photographs of one person on
 *  one day, measure the spread and replace these with it.
 *
 *  A change with a normal reference must clear BOTH floors. The relative floor
 *  stands in for measurement noise; the SD floor asks whether the change is
 *  large on the scale the population varies over. Requiring both is the
 *  conservative reading, and conservative is the right direction to be wrong in
 *  when the output is "your face changed". */
export const MEANINGFUL_REL_DELTA = 0.05;
export const MEANINGFUL_SD_DELTA = 0.5;

/** Yaw or pitch difference between two sittings past which the diff is flagged.
 *  Taken from the frontal quality gate, which already stops trusting asymmetry
 *  past 3° of yaw, rather than invented separately here. */
export const POSE_DELTA_FLOOR_DEG = 3;

const FORMAT_NAME = 'prosopon-history';
const FORMAT_VERSION = 1;
const MS_PER_DAY = 86400000;
const LABEL_MAX = 80;
const NOTE_MAX = 600;
const MAX_METRIC_KEYS = 256;
const MAX_KEY_LEN = 64;
const SEX_VALUES = ['male', 'female'];

// The keys summarise() uses in report.js. Note what summarise() actually
// returns under them: `total` is a count, but `typical`, `slight`, `notable`
// and `unscored` are ARRAYS OF ROWS. A tally is stored as five counts, so an
// array under one of these keys is taken as its length — otherwise a caller
// handing over summarise()'s own output would silently store nothing but
// `total`. They are validated rather than recomputed, because history.js does
// not import report.js and a stored tally is a record of what the report said
// on the day, not a derivation.
const TALLY_KEYS = ['typical', 'slight', 'notable', 'unscored', 'total'];
const POSE_KEYS = ['yaw', 'pitch', 'roll'];
const SCALE_KEYS = ['mmPerPx', 'irisPx', 'asymmetryPct'];

// ---------------------------------------------------------------- storage --

/** localStorage, or null where it is missing or blocked.
 *
 *  Reading the property itself throws — not just the method call — when DOM
 *  storage is disabled by policy or by a privacy setting, so even this much has
 *  to be wrapped. */
function ls() {
  try {
    return globalThis.localStorage || null;
  } catch (err) {
    return null;
  }
}

/** Read and validate the whole store.
 *
 *  `state` distinguishes three failures that call for different treatment:
 *  'unavailable' means nothing can be written either, 'corrupt' means the value
 *  cannot be parsed and so cannot be preserved, and 'foreign' means a schema
 *  from another version of this file, which CAN be preserved and therefore must
 *  not be overwritten. Individual rows that fail validation are dropped: they
 *  cannot be rendered or diffed, and keeping them would only propagate them
 *  into the next export. */
function loadStore() {
  const store = ls();
  if (!store) return { state: 'unavailable', snapshots: [] };
  let raw;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch (err) {
    return { state: 'unavailable', snapshots: [] };
  }
  if (raw == null || raw === '') return { state: 'ok', snapshots: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { state: 'corrupt', snapshots: [] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: 'corrupt', snapshots: [] };
  }
  if (parsed.v !== FORMAT_VERSION) return { state: 'foreign', snapshots: [] };
  const list = Array.isArray(parsed.snapshots) ? parsed.snapshots : [];
  const clean = [];
  for (const row of list) {
    const r = normalizeEntry(row);
    if (r.ok) clean.push(r.entry);
  }
  return { state: 'ok', snapshots: sortSnapshots(clean) };
}

/** Write the whole store, evicting the oldest snapshot once if the quota
 *  rejects it.
 *
 *  Two properties matter here. First, the write is a single setItem of the
 *  complete store, so a throw leaves the PREVIOUS value intact — the existing
 *  history cannot be lost to a quota error, and nothing is ever removed before
 *  a successful write. Second, we do not try to identify a quota error: the
 *  signal is inconsistent across browsers (DOMException code 22, code 1014,
 *  name 'QuotaExceededError', or a SecurityError in a private window), so any
 *  failure gets the same treatment. Retrying one snapshot lighter is harmless
 *  when the real cause was a blocked store, because the retry fails too and the
 *  caller is told.
 *
 *  Eviction is only offered to the two callers that are adding something and
 *  can report the trade. A rename or a delete must never cost the user a
 *  snapshot it was not asked to remove, so those pass evict: false and take a
 *  refused write as a plain failure. */
function writeSnapshots(list, { evict = true } = {}) {
  const store = ls();
  if (!store) return { ok: false, evicted: 0, snapshots: list };
  const attempt = (snapshots) => {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify({ v: FORMAT_VERSION, snapshots }));
      return true;
    } catch (err) {
      return false;
    }
  };
  if (attempt(list)) return { ok: true, evicted: 0, snapshots: list };
  if (evict && list.length > 1) {
    const trimmed = list.slice(1);
    if (attempt(trimmed)) return { ok: true, evicted: 1, snapshots: trimmed };
  }
  return { ok: false, evicted: 0, snapshots: list };
}

function storageError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** The store is JSON-only by construction, so a round trip is a complete copy.
 *  Callers get copies so that mutating what they were handed cannot alter what
 *  is about to be written back. */
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

// -------------------------------------------------------------- validation --

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/** Metric map, reduced to finite numbers under sorted keys.
 *
 *  computeFrontal() hands back { id: { id, value, detail } }; a caller that has
 *  already flattened it hands back { id: number }. Both are accepted, and only
 *  the value is kept — `detail` is per-photograph working data, not something a
 *  diff can use. Keys are sorted so that two exports of the same history are
 *  byte-identical. */
function numberMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  let n = 0;
  for (const key of Object.keys(raw).sort()) {
    if (n >= MAX_METRIC_KEYS) break;
    if (!key || key.length > MAX_KEY_LEN) continue;
    const v = raw[key];
    const value = typeof v === 'number' ? v : (v && typeof v === 'object' ? v.value : NaN);
    if (!Number.isFinite(value)) continue;
    out[key] = value;
    n += 1;
  }
  return out;
}

function pickNumbers(raw, keys) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let n = 0;
  for (const key of keys) {
    if (Number.isFinite(raw[key])) {
      out[key] = raw[key];
      n += 1;
    }
  }
  return n ? out : null;
}

function tallyOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let n = 0;
  for (const key of TALLY_KEYS) {
    // summarise() files its rows under these keys as arrays; the count is the
    // length. A caller that has already counted them sends a number.
    const v = Array.isArray(raw[key]) ? raw[key].length : raw[key];
    // These are counts. A negative one means the caller sent something that is
    // not a tally, and taking it would put a nonsense delta in every diff.
    if (Number.isFinite(v) && v >= 0) {
      out[key] = v;
      n += 1;
    }
  }
  return n ? out : null;
}

/** Validate untrusted input and rebuild one snapshot from known fields.
 *
 *  `fresh` marks a snapshot being saved for the first time: it has no id yet
 *  and may omit `at`. Anything read back from storage or from an import file
 *  must carry both, or it cannot be sorted, addressed or diffed.
 *
 *  The output is assembled field by field. That whitelist is the mechanism that
 *  keeps an image out of the store, so extend it deliberately. */
function normalizeEntry(raw, { fresh = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'not an object' };
  }
  let at = raw.at;
  if (typeof at === 'string') {
    const parsed = Date.parse(at);
    at = Number.isFinite(parsed) ? parsed : NaN;
  }
  if (!Number.isFinite(at)) {
    if (!fresh) return { ok: false, error: '"at" is missing or is not a timestamp' };
    at = Date.now();
  }
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, MAX_KEY_LEN) : null;
  if (!fresh && !id) return { ok: false, error: 'missing "id"' };

  const metrics = numberMap(raw.metrics);
  const profile = numberMap(raw.profile);
  if (!Object.keys(metrics).length && !Object.keys(profile).length) {
    return { ok: false, error: 'no finite metric values' };
  }

  return {
    ok: true,
    entry: {
      id,
      at,
      label: text(raw.label, LABEL_MAX),
      note: text(raw.note, NOTE_MAX),
      // Kept because the references are sex-specific: diffing across a changed
      // setting would silently change the yardstick as well as the face.
      sex: SEX_VALUES.includes(raw.sex) ? raw.sex : null,
      metrics,
      profile,
      tally: tallyOf(raw.tally),
      // Roll is corrected out by the midline-aligned frame, so it is stored as
      // provenance rather than as something a diff should react to.
      pose: pickNumbers(raw.pose, POSE_KEYS),
      scale: pickNumbers(raw.scale, SCALE_KEYS),
    },
  };
}

/** Ascending by time, with the id as the tiebreak so that the order of two
 *  snapshots saved in the same millisecond never depends on insertion order.
 *  Plain string comparison, not localeCompare: the ordering must not vary with
 *  the user's locale. */
function sortSnapshots(list) {
  return [...list].sort((a, b) => (a.at - b.at)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Ids are derived, never random: Math.random() is unavailable in some host
// contexts, and a random id would also make two exports of one history differ
// for no reason. The timestamp carries the ordering, the counter separates
// saves within a millisecond, and a collision with an id already in the store —
// which happens after a reload, since the counter starts again at zero —
// advances the counter until the id is free. The loop terminates because every
// iteration produces a distinct string.
let seq = 0;

function nextId(at, taken) {
  const stamp = at.toString(36);
  let id;
  do {
    id = `s${stamp}-${(seq++).toString(36).padStart(2, '0')}`;
  } while (taken.has(id));
  return id;
}

function summaryOf(entry) {
  return {
    id: entry.id,
    at: entry.at,
    label: entry.label,
    note: entry.note,
    tally: clone(entry.tally),
  };
}

// ------------------------------------------------------------------- API ----

/** Store one snapshot and return its id.
 *
 *  Throws rather than returning a sentinel when the entry cannot be persisted.
 *  There is no room in a returned id to report a failure, and a save that
 *  silently did nothing would leave the user believing a baseline exists.
 *  The thrown error carries `code`: 'invalid', 'unavailable', 'foreign' or
 *  'quota'. */
export function saveSnapshot(entry) {
  const r = normalizeEntry(entry, { fresh: true });
  if (!r.ok) throw storageError(`Cannot save this snapshot: ${r.error}.`, 'invalid');

  const store = loadStore();
  if (store.state === 'unavailable') {
    throw storageError('Local storage is unavailable, so history cannot be kept. Private windows and blocked site data both do this.', 'unavailable');
  }
  // A store written by a newer version of this file is intelligible to that
  // version and not to this one, so it is left alone. An unparseable store is
  // intelligible to nobody and is replaced.
  if (store.state === 'foreign') {
    throw storageError('The stored history was written by a newer version of this tool and will not be overwritten. Export it there first.', 'foreign');
  }

  const taken = new Set(store.snapshots.map((s) => s.id));
  const id = nextId(r.entry.at, taken);
  let list = sortSnapshots([...store.snapshots, { ...r.entry, id }]);
  if (list.length > HISTORY_LIMIT) list = list.slice(list.length - HISTORY_LIMIT);

  // Only reachable when the caller backdated the entry past everything already
  // stored. Reporting it beats returning an id that addresses nothing.
  if (!list.some((s) => s.id === id)) {
    throw storageError(`History is full at ${HISTORY_LIMIT} snapshots and this entry is older than all of them.`, 'quota');
  }

  const w = writeSnapshots(list);
  if (!w.ok) {
    throw storageError('Local storage refused the write, so this snapshot was not saved. The existing history is untouched.', 'quota');
  }
  if (!w.snapshots.some((s) => s.id === id)) {
    throw storageError('Local storage is full and the new snapshot did not fit even after evicting the oldest.', 'quota');
  }
  return id;
}

/** Every snapshot, newest first, without the metric payload. */
export function listSnapshots() {
  return loadStore().snapshots.map(summaryOf).reverse();
}

/** One snapshot in full, or null. The caller gets a copy. */
export function getSnapshot(id) {
  const found = loadStore().snapshots.find((s) => s.id === id);
  return found ? clone(found) : null;
}

/** Returns false when the id is unknown or the write failed, so a caller that
 *  removes a row from a list on `true` cannot remove one that is still stored. */
export function deleteSnapshot(id) {
  const store = loadStore();
  if (store.state !== 'ok') return false;
  const list = store.snapshots.filter((s) => s.id !== id);
  if (list.length === store.snapshots.length) return false;
  return writeSnapshots(list, { evict: false }).ok;
}

/** Set or clear a snapshot's label. An empty string clears it. */
export function renameSnapshot(id, label) {
  const store = loadStore();
  if (store.state !== 'ok') return false;
  const found = store.snapshots.find((s) => s.id === id);
  if (!found) return false;
  const list = store.snapshots.map((s) => (s.id === id ? { ...s, label: text(label, LABEL_MAX) } : s));
  return writeSnapshots(list, { evict: false }).ok;
}

export function clearHistory() {
  const store = ls();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch (err) {
    // Nothing to do and nothing to report: the signature promises no result,
    // and a store that refuses removeItem also refused every write into it.
  }
}

// ------------------------------------------------------------------ diff ----

/** Standard deviation of the population reference for one metric, where the
 *  reference is a distribution rather than a target range.
 *
 *  A caveat that travels with every SD figure below: this is a BETWEEN-SUBJECT
 *  spread, so a delta expressed in these units says "this much of the spread
 *  across people", not "this much more than the noise of the instrument". The
 *  two are not the same quantity and only the second would be a repeatability
 *  claim. */
function refSdFor(id, kind, sex) {
  const entry = (kind === 'profile' ? PROFILE_NORMS : NORMS)[id];
  const ref = refFor(entry, sex);
  return ref && ref.kind === 'nm' && Number.isFinite(ref.sd) && ref.sd > 0 ? ref.sd : null;
}

function compare(fromMap, toMap, kind, sex) {
  const out = [];
  for (const id of Object.keys(fromMap).sort()) {
    if (!(id in toMap)) continue;
    const a = fromMap[id];
    const b = toMap[id];
    const delta = b - a;
    const entry = (kind === 'profile' ? PROFILE_NORMS : NORMS)[id] || null;
    const sd = refSdFor(id, kind, sex);
    const sdDelta = sd ? delta / sd : null;

    // Dividing by the earlier value alone explodes when the baseline sits near
    // zero, which the signed angles do — a canthal tilt moving 0.2° to 1.2° is
    // not a 500% change in anything. The larger of the two magnitudes is the
    // stable denominator.
    const span = Math.max(Math.abs(a), Math.abs(b));
    const rel = span > 0 ? delta / span : null;

    // How many times over its own floor each available test puts this change.
    // Expressing both on that common scale is what lets one number rank a
    // millimetre against an angle, and 1 is the meaningfulness boundary by
    // construction.
    const floors = [];
    if (sdDelta != null) floors.push(Math.abs(sdDelta) / MEANINGFUL_SD_DELTA);
    if (rel != null) floors.push(Math.abs(rel) / MEANINGFUL_REL_DELTA);
    const overFloor = floors.length ? Math.min(...floors) : 0;

    out.push({
      id,
      kind,
      from: a,
      to: b,
      delta,
      relDelta: rel,
      sd: sdDelta,
      refSd: sd,
      unit: entry ? entry.unit : null,
      tier: entry ? entry.tier : null,
      // Where norms.js flags the measurement as not comparable to the published
      // one, the SD is only approximately the right yardstick: a measurement
      // that reads 13% short also varies about 13% less, so the SD figure
      // understates the change. The error runs in the conservative direction,
      // which is why the delta is still reported rather than withheld.
      uncalibrated: entry ? entry.uncalibrated === true : false,
      overFloor,
      meaningful: floors.length > 0 && overFloor >= 1,
      basis: sdDelta != null && rel != null ? 'sd+relative'
        : sdDelta != null ? 'sd'
          : rel != null ? 'relative' : 'none',
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    });
  }
  return out;
}

function deltaOf(a, b, keys) {
  if (!a || !b) return null;
  const out = {};
  let n = 0;
  for (const key of keys) {
    if (Number.isFinite(a[key]) && Number.isFinite(b[key])) {
      out[key] = b[key] - a[key];
      n += 1;
    }
  }
  return n ? out : null;
}

function missingFrom(a, b) {
  return Object.keys(a).filter((k) => !(k in b)).sort();
}

/** Compare two snapshots. Returns null if either id is unknown.
 *
 *  The arguments are NOT reordered by date. The sign of every delta means "from
 *  a to b" as the caller asked for it, and a negative `days` is the honest
 *  signal that the pair was picked backwards — which silently swapping them
 *  would hide. */
export function diffSnapshots(aId, bId) {
  const list = loadStore().snapshots;
  const from = list.find((s) => s.id === aId);
  const to = list.find((s) => s.id === bId);
  if (!from || !to) return null;

  // The later setting wins, because it is the one the user is looking at.
  const sex = to.sex || from.sex || null;
  const changes = [
    ...compare(from.metrics, to.metrics, 'front', sex),
    ...compare(from.profile, to.profile, 'profile', sex),
  ].sort((x, y) => (y.overFloor - x.overFloor)
    || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  const pose = deltaOf(from.pose, to.pose, POSE_KEYS);
  const mmFrom = from.scale ? from.scale.mmPerPx : NaN;
  const mmTo = to.scale ? to.scale.mmPerPx : NaN;
  const scaleSpan = Math.max(Math.abs(mmFrom), Math.abs(mmTo));
  const scaleRelDelta = Number.isFinite(scaleSpan) && scaleSpan > 0
    ? (mmTo - mmFrom) / scaleSpan : null;

  const tallyDelta = from.tally && to.tally
    ? TALLY_KEYS.reduce((acc, k) => {
      if (Number.isFinite(from.tally[k]) && Number.isFinite(to.tally[k])) acc[k] = to.tally[k] - from.tally[k];
      return acc;
    }, {})
    : null;

  return {
    from: summaryOf(from),
    to: summaryOf(to),
    days: round((to.at - from.at) / MS_PER_DAY, 2),
    changes,
    summary: {
      compared: changes.length,
      meaningful: changes.filter((c) => c.meaningful).length,
      // Reported whether or not it crosses the floor, because a reader
      // comparing two numbers is entitled to know how differently the head was
      // held when each was taken. Yaw in particular compresses the far side of
      // the face and will move a width or an asymmetry figure further than a
      // year of anything the face did on its own.
      pose,
      poseKnown: pose != null,
      poseSuspect: pose != null
        && (Math.abs(pose.yaw || 0) >= POSE_DELTA_FLOOR_DEG
          || Math.abs(pose.pitch || 0) >= POSE_DELTA_FLOOR_DEG),
      // A shift in the iris calibration moves every millimetre value together.
      // Ratios are unaffected, which is the usual reason to read them instead.
      scaleRelDelta,
      scaleSuspect: scaleRelDelta != null && Math.abs(scaleRelDelta) >= MEANINGFUL_REL_DELTA,
      sexChanged: !!(from.sex && to.sex && from.sex !== to.sex),
      tally: tallyDelta,
      // A metric measured in only one of the two sittings has no delta. Listing
      // them stops the comparison from looking more complete than it is.
      onlyIn: {
        from: [...missingFrom(from.metrics, to.metrics), ...missingFrom(from.profile, to.profile)],
        to: [...missingFrom(to.metrics, from.metrics), ...missingFrom(to.profile, from.profile)],
      },
    },
  };
}

// ------------------------------------------------------ export and import ---

/** The whole history as a JSON string, ready to be written to a file by the
 *  caller. Snapshots are emitted oldest-first with sorted metric keys, so the
 *  payload of two exports of an unchanged history is identical text and a diff
 *  of two export files shows only what actually changed — apart from the
 *  `exportedAt` stamp on the envelope, which is provenance and moves every
 *  time. */
export function exportHistory() {
  return JSON.stringify({
    format: FORMAT_NAME,
    v: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    snapshots: loadStore().snapshots,
  }, null, 2);
}

/** Read an export back in.
 *
 *  Never throws. Unlike saveSnapshot() this function has somewhere to put a
 *  failure, and an import is exactly where a caller needs the reasons rather
 *  than an exception: a file can be half valid, and the half that is valid is
 *  worth having.
 *
 *  With `merge` (the default) the file's snapshots are added to what is already
 *  stored. Without it the store is replaced — but only by a file that actually
 *  contains something, since replacing a good history with an empty one is not
 *  an import, it is a deletion, and clearHistory() exists for that. */
export function importHistory(json, { merge = true } = {}) {
  const result = { added: 0, skipped: 0, errors: [] };

  if (typeof json !== 'string' || !json.trim()) {
    result.errors.push('Nothing to import: expected the text of an export file.');
    return result;
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    result.errors.push(`Not valid JSON: ${err.message}`);
    return result;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    result.errors.push('Not a history file: the top level is not an object.');
    return result;
  }
  if (parsed.format !== FORMAT_NAME) {
    result.errors.push(`Not a prosopon history file: expected format "${FORMAT_NAME}", found ${JSON.stringify(parsed.format) || 'nothing'}.`);
    return result;
  }
  if (parsed.v !== FORMAT_VERSION) {
    result.errors.push(`History file version ${JSON.stringify(parsed.v)} cannot be read by this version, which writes version ${FORMAT_VERSION}.`);
    return result;
  }
  if (!Array.isArray(parsed.snapshots)) {
    result.errors.push('History file has no "snapshots" array.');
    return result;
  }

  const store = loadStore();
  if (store.state === 'unavailable') {
    result.errors.push('Local storage is unavailable, so nothing can be imported into it.');
    return result;
  }
  if (store.state === 'foreign') {
    result.errors.push('The stored history was written by a newer version of this tool and will not be overwritten.');
    return result;
  }

  const base = merge ? store.snapshots : [];
  const taken = new Set(base.map((s) => s.id));
  const incoming = [];
  parsed.snapshots.forEach((row, i) => {
    const r = normalizeEntry(row);
    if (!r.ok) {
      result.skipped += 1;
      result.errors.push(`Snapshot ${i + 1} rejected: ${r.error}.`);
      return;
    }
    // Ids are derived from the moment of saving, so a collision is the same
    // sitting coming back round. Re-iding it would file a duplicate of one
    // photograph under two dates.
    if (taken.has(r.entry.id)) {
      result.skipped += 1;
      return;
    }
    taken.add(r.entry.id);
    incoming.push(r.entry);
  });

  if (!merge && !incoming.length) {
    result.errors.push('Refusing to replace the stored history with a file that contains no readable snapshots.');
    return result;
  }
  if (!incoming.length) return result;

  let list = sortSnapshots([...base, ...incoming]);
  if (list.length > HISTORY_LIMIT) {
    const dropped = list.length - HISTORY_LIMIT;
    list = list.slice(dropped);
    result.errors.push(`${dropped} oldest snapshot${dropped === 1 ? '' : 's'} dropped to stay within the ${HISTORY_LIMIT}-snapshot limit.`);
  }

  const w = writeSnapshots(list);
  if (!w.ok) {
    result.errors.push('Local storage refused the write, so nothing was imported. The existing history is untouched.');
    return result;
  }
  const kept = new Set(w.snapshots.map((s) => s.id));
  for (const entry of incoming) {
    if (kept.has(entry.id)) result.added += 1;
    else result.skipped += 1;
  }
  if (w.evicted) {
    result.errors.push(`${w.evicted} oldest snapshot evicted: local storage was full.`);
  }
  return result;
}
