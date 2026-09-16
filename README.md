# prosopon

*πρόσωπον* — face. The root of the prosopic index this tool computes, and of
the older sense of a face as the thing presented, which is about right for
something that spends most of its effort on the gap between what is measured
and what is seen.


**<https://aniketh.net/prosopon>**

Facial morphometrics from a photograph. Landmark measurements compared against
published anthropometric reference ranges, with the provenance and the error
bars attached to every number.

Runs entirely in the browser. The model, the fonts and the code are vendored —
nothing is uploaded, and it works with the network off.

## Running it

It is deployed at <https://aniketh.net/prosopon> — the page runs the model in
your browser, so the photo never leaves your machine there either.

To run it locally:

```bash
./setup.sh                  # fetches the MediaPipe runtime and the model
python3 -m http.server 8777
```

Then open <http://127.0.0.1:8777/>.

It has to be served over HTTP — ES modules and WebAssembly will not load from
`file://`. After `setup.sh` has run once, nothing else touches the network:
the model, the runtime and the fonts are all local, and no image ever leaves
the machine.

Two things are fetched rather than committed: ~21MB of MediaPipe wasm and the
3.6MB landmark model. The eighteen validation portraits are neither committed
nor fetched — they are photographs of real people under a mix of licences, and
the app needs none of them. Drop in any photo. Their provenance and the known
limits of that set are in [`testdata/SOURCES.md`](testdata/SOURCES.md).

## What it does

**Frontal** — MediaPipe Face Landmarker places 478 points (468 face + two iris
rings). Because the iris ring is detected, pixels convert to millimetres: the
horizontal visible iris diameter is ~11.7mm with an SD near 0.5mm across adults,
which is why ophthalmology uses it as a photographic scale reference. 27
measurements are computed in a midline-aligned frame, so photo tilt cannot leak
into any width, height or angle.

**Profile** — 21 hand-placed landmarks feeding a soft-tissue cephalometric
analysis: nasofrontal, nasolabial, nasofacial, nasomental, facial convexity,
mentolabial, Ricketts E-line, gonial angle, mandibular plane, ramus ratio,
cervicomental, Goode projection, dorsal contour, chin projection. Placement is
manual on purpose — mesh fitting degrades badly past ~60° of yaw, which is
exactly where a lateral view lives.

**Skin** — regional CIELAB colourimetry: periorbital contrast typed as vascular
or pigmented, regional erythema against the facial median, tone evenness, and
ITA. Compares regions within one photo; it does not claim absolute colour.

**Appearance markers** — brow density against a local forehead reference so it
works across skin tones, lip smoothness and vermilion border sharpness, iris
colour, and skin texture energy. None of these has a published population norm,
so none is scored. The two 0–100 scales were calibrated against the validation
set so its median face sits at 50; before that calibration fifteen of eighteen
portraits scored below 2 and the measure could not discriminate at all.

**Composites** — averageness as Procrustes distance to a mean shape computed by
generalised Procrustes superimposition over the validation set, and a sexual
dimorphism projection built only from measurements that actually have separate
male and female references. Neither is scored: averageness has a real research
basis, but eighteen faces is not a population.

**Preview** — a piecewise-affine warp of the photograph toward an adjusted
landmark configuration, with a before/after split. Eight controls: thirds, mouth
position, canthal tilt, brow height, alar width, lip fullness, chin height, jaw
width. This is deliberately not an AI projection. It moves the pixels that are
there, so it cannot add tissue, cannot relight a changed surface, and goes
rubbery past small adjustments — which is why the ranges are clamped.

**History** — snapshots stored locally, with a diff between any two. This is the
most defensible thing in the tool: measuring the same face twice cancels the
systematic biases that wreck comparison against a population. The landmark
offsets, the ~8% millimetre bias and the European reference samples all subtract
out of a difference. Changes below the measurement's own noise floor are greyed
rather than reported, and pose difference between the two photographs is shown
alongside, because head rotation moves these numbers more than most real change
does. Photographs are never stored, only the numbers.

**What would move it** — each actionable finding mapped to the category of
intervention that would change it, with an evidence grade and a citation, how
reversible it is and over what timescale. No products, no brands, no prices, no
month-by-month schedule: there is no basis for any of those, and a confident
price beside an invented recommendation is the exact failure this tool exists to
avoid.

## What makes it different from the paid versions

Every reference value was checked against the primary literature, and every
measurement was run across eighteen portraits spanning ancestry, sex and age
(26 to 84). Both passes changed the tool substantially.

**The source audit.** Of 41 reference values, 8 were confirmed as written, 17
were wrong, 3 could not be sourced at all, and several had the right number
credited to the wrong paper. The canthal-tilt entry had two figures labelled
male and female that are both published values for white women. Eye height had
the sexes inverted. The brow-peak target was wrong by a wide margin. The facial-
index bands were credited to Farkas but belong to Martin & Saller, and are
sex-specific in a way the tool was ignoring. The gonial angle was credited to an
analysis that contains no gonial angle.

**The validation run.** Seven more measurements turned out to fail on *everyone*
— nose width reading ~7mm wide on nearly every face, the nose-to-eye-spacing
ratio outside its band on all eighteen, the facial index low on most. When a
reference rejects the entire population, the reference is wrong, or it is
measuring something other than what it claims.

The result is that **10 of 27 frontal measurements are scored** and 17 are shown
without a verdict. That is the honest number. A tool that scored all 27 would
look more impressive and be wrong about most of them.

Every number also carries an evidence tier:

- **Population anthropometry** — a real mean and SD, so a real z-score.
- **Clinical planning range** — what surgeons plan against. A convention, not a
  distribution.
- **Aesthetic convention** — equal thirds, facial fifths. Renaissance drawing
  canons; Farkas tested them against measured faces in 1985 and most are met by
  a minority of any population.
- **No clinical basis** — metrics that circulate online with confident numbers
  and nothing behind them. Shown, never scored.

Nasal metrics are additionally held out of the headline tally, because their
reference samples were predominantly European and scoring them mostly reports
that fact. There is no score out of ten, because no such number exists to
compute.

## Validation

`validate.html` re-runs the whole pipeline across the eighteen-portrait set and
reports, per measurement, how many faces land typical / slightly off / well
outside. That is the check that catches a bad reference: a measurement flagging
most of a diverse population is broken, not insightful.

Current state: an average face in the set scores 5.4 typical, 2.9 slightly off
and 0.6 well outside across the 9 counted measurements, and no single
measurement flags a majority. Canthal tilt — the most-quoted number in this
genre — flags nobody, with a median of 4.3° against a published 4.0–5.8°.

What is still weak is written up on the Method page: eighteen faces is a
validation set, not a study; the 9.69° pitch correction rests on three
photographs; six of the eighteen have parted lips; nobody is under 26.

## Layout

```
setup.sh            fetches runtime, model and sample portraits
index.html          markup
styles.css          design tokens and components
src/geom.js         vector and angle primitives
src/landmarks.js    named anatomical points, iris scale, head pose
src/metrics-front.js  frontal measurements + photo-quality gate
src/metrics-profile.js  cephalometric analysis
src/norms.js        reference data, evidence tiers, sources
src/skin.js         CIELAB regional colourimetry
src/render.js       canvas overlay
src/report.js       grouping and interpretation
src/texture.js      appearance markers (brow, lip, iris, skin texture)
src/composite.js    averageness and sexual dimorphism
src/mean-shape.js   Procrustes mean over the validation set
src/morph.js        piecewise-affine warp preview
src/history.js      local snapshots and diffing
src/protocol.js     intervention catalogue with evidence grades
src/method.js       methodology page
src/app.js          orchestration
vendor/             MediaPipe runtime + EB Garamond
models/             face_landmarker.task
```

## Limits

It measures geometry, not people. It cannot measure bone — a soft-tissue jaw
angle is not a radiographic gonial angle. And it cannot separate you from the
photograph: focal length, camera height, lighting and expression move these
numbers more than most anatomy does. Shoot from two metres at eye level, in flat
light, with every filter off.
