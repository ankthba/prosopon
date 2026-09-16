export const METHOD_HTML = `
<h2>How this works</h2>
<p>A photograph goes in; a set of measurements comes out, each one compared against a published reference range and labelled with where that range came from. Nothing is uploaded — the model runs in this browser tab, and the image never leaves the machine.</p>

<div class="callout"><p><b>The one thing worth understanding:</b> a reference range is an average of some population, not a target. Half of every healthy population sits below the mean of any measurement. "Outside the range" here means <i>uncommon in the reference sample</i> — and very often it means the reference sample did not look like you.</p></div>

<h2>The pipeline</h2>
<h3>1. Landmarks</h3>
<p>Google's MediaPipe Face Landmarker places 478 points: 468 on the face plus two five-point iris rings. It runs on WebAssembly, locally. Every named anatomical point used here (menton, pronasale, the canthi, the alar bases) was verified against the mesh rather than copied from a blog post.</p>

<h3>2. Scale</h3>
<p>Most online face-ratio tools can only give you ratios, because a photo has no intrinsic scale. This one uses the iris. Horizontal visible iris diameter is about <code>11.7mm</code> with a standard deviation near <code>0.5mm</code>, and it is remarkably stable across age, sex and ancestry — which is why ophthalmology uses it as a photographic reference. Detecting the iris ring therefore converts pixels to millimetres. The iris's own variation puts about ±4% on that figure, and testing on real photographs found a further systematic offset of roughly 8% on top of it — see below — so absolute millimetre values are approximate and ratios are the safer thing to read.</p>
<p>The caveat is perspective. Calibration is exact at the plane of the eyes; the nose is nearer the camera and the ears are further away. Shoot from at least two metres with the lens zoomed in and the error is small. Shoot a selfie at arm's length and the nose will measure large and the face narrow, because that is what a wide lens at close range does to a face. This is most of what people are reacting to when they say they look worse in photos than in mirrors.</p>

<h3>3. Alignment</h3>
<p>Every measurement is taken in a midline-aligned frame. The midsagittal axis is fitted through the unpaired midline landmarks by total least squares — orthogonal regression, because the residual that matters is perpendicular to the axis — and the whole point set is rotated so that axis is vertical. A tilted photograph therefore cannot leak into any width, height or tilt figure.</p>

<h3>4. Pose gate</h3>
<p>This is the step most face-analysis tools skip, and it is the one that decides whether anything downstream is real. Head yaw and pitch are read from the model's 3D transformation matrix. Pitch is the dangerous one: tilting the chin down by ten degrees visibly shortens the lower third, widens the jaw and sharpens the jaw angle. A report generated from a badly angled photo is not roughly right — it is confidently wrong. So the pose is shown, and measurements are flagged when it is out of range.</p>

<h3>5. Symmetry</h3>
<p>Paired landmarks are mirrored across the fitted midline and compared to their opposite number, and the mismatch is reported as RMS millimetres, broken down by region. Everyone is asymmetric. Population RMS clusters near 1.2mm, and observers generally cannot detect facial asymmetry below about 3mm — so the number is only interesting once it is well past that.</p>

<h3>6. Skin</h3>
<p>Sample discs are placed relative to the landmarks and converted to CIELAB. Within one photograph, comparisons hold up: under-eye against the cheek below it, nose against forehead, left against right. Absolute colour does not hold up, because phone cameras apply auto white balance, tone curves and in many cases undisclosed smoothing. When the two sides of the face differ by more than about six L* units the lighting is directional, and the tool says so rather than reporting the shadow as a skin finding.</p>

<h2>What the validation showed</h2>
<p>None of the above is taken on trust. The pipeline was run against real photographs and against a deliberately rotated test image, and the results changed what the tool reports — pitch now carries a fixed offset correction, the roll term a sign correction, one family of measurements is no longer scored at all, and one known bias is carried openly as stated uncertainty rather than quietly corrected.</p>

<h3>Pitch reads about ten degrees high before correction</h3>
<p>MediaPipe's facial transformation matrix is expressed relative to its canonical face model, and that model's neutral head is not at zero pitch. Three independent studio portraits shot at camera level — three different people, three different photographers — gave raw pitch readings of 9.75°, 10.01° and 9.31°. All three land within 0.4° of their mean — a clustering far too tight to be a coincidence of how three people happened to hold their heads; it is the canonical model's own tilt showing through. The app therefore subtracts the 9.69° mean, so a level head reads near zero, and treats the corrected figure as accurate to roughly ±3°.</p>

<h3>Roll does not leak into pitch or yaw</h3>
<p>Rotating a single test image through -20°, -10°, -5°, 0, +5°, +10° and +20° confirmed the decomposition. The eye-line roll measure tracked the applied rotation at a slope of 1.00, while pitch and yaw held constant to within 0.5° across the whole sweep. That is what rules out roll contaminating the other two axes: an in-plane tilt is measured as a tilt and as nothing else, which is the assumption the alignment step depends on. The same sweep also exposed that the matrix's own roll term is sign-flipped relative to image convention. That is now corrected.</p>

<h3>Eye width is a different measurement from the caliper one</h3>
<p>Across four faces the mesh's eye width came out at 0.426, 0.430, 0.430 and 0.418 times the interpupillary distance — a spread of under 0.013, which is about as consistent as anything here gets. Caliper anthropometry gives roughly 0.489. The gap is not scatter. MediaPipe's lateral canthus sits about 2mm medial to the true anatomical point, so mesh eye width reads around 13% short on every face. That is a difference in what is being measured, not an error that averaging or a larger sample fixes.</p>
<p>So eye width, eye height and the ratios built on them are shown as raw numbers and deliberately not scored against caliper norms. There is no z-score and no percentile on any of them.</p>

<div class="callout"><p><b>This is how these tools go wrong.</b> A tool that scores mesh eye width against Farkas will call a perfectly ordinary pair of eyes too small — on every face it ever sees, by a consistent 13%, with a percentile attached to make it look like a finding. Nothing about the output looks broken. That is the failure mode worth worrying about: not noise, but a clean, confident, repeatable wrong answer.</p></div>

<h3>Millimetres carry about 8% of systematic error; ratios carry none of it</h3>
<p>Iris-calibrated interpupillary distance came out at 58.4, 57.8, 55.8 and 57.9mm against a published adult mean near 63mm — consistently about 8% low. Some of that is real variation across four faces, and some is the iris ring fitting slightly outside the true limbus. Either way the absolute millimetre values carry roughly 8% of systematic uncertainty on top of the iris's own 4% standard deviation. Ratios are unaffected, because the scale factor appears in the numerator and the denominator and cancels. Read the ratios; treat the millimetres as an order of magnitude.</p>

<h3>Asymmetry is mostly head rotation</h3>
<p>Asymmetry RMS was measured across the four test faces alongside the yaw of each photograph:</p>
<table>
<tr><th>Yaw</th><th>Asymmetry RMS</th></tr>
<tr><td>0.3°</td><td>1.78mm</td></tr>
<tr><td>2.4°</td><td>2.48mm</td></tr>
<tr><td>4.0°</td><td>6.12mm</td></tr>
<tr><td>13.2°</td><td>14.23mm</td></tr>
</table>
<p>Asymmetry as measured is dominated by head rotation, not by the face. The one portrait that was genuinely square to the camera came in at 1.78mm, the only reading in the set close to the 1.2mm population mean; by 4° of yaw the figure has already passed twice the 3mm threshold at which observers notice asymmetry at all, and none of that excess is anything about the person. This is the pose gate earning its place. An asymmetry number quoted without the yaw it was measured at is a measurement of how the photo was taken.</p>

<h2>What the source audit found</h2>
<p>The reference values in this tool were originally written from memory, which is the same way most face-analysis software acquires them. Every one was then checked against the primary literature, and a second reviewer independently re-checked each proposed correction. Of 41 reference values, 8 were confirmed as written, 17 were wrong, 3 could not be sourced at all, and the rest had the right number credited to the wrong paper.</p>

<p>Some of the errors were the kind that quietly produce confident nonsense. The canthal tilt entry carried two figures labelled male and female; both are in fact published values for white women, and no white-male norm appears to exist in the literature at all. The eye-height entry had the sexes inverted — women average slightly taller palpebral fissures than men, not shorter. The brow-peak target of 0.62&ndash;0.70 was simply wrong: the lateral limbus sits near 0.69&ndash;0.76, and measured brows peak beyond it, at 0.93 of eye width in ordinary women. The facial-index bands were credited to Farkas but belong to Martin &amp; Saller, and they are sex-specific in a way the tool was ignoring — applying the male scale to a woman moves her a whole class. The mentolabial angle was credited to a 1967 paper that is about lip posture and contains no such angle. The gonial angle was credited to Steiner&rsquo;s analysis, which contains no gonial angle.</p>

<div class="callout"><p>The general lesson: a confident number with a real-looking citation attached is not evidence of anything. Roughly two in five of these failed on contact with the source.</p></div>

<h2>What the eighteen-face validation found</h2>
<p>Corrected values were then run across eighteen portraits chosen to span ancestry, sex and age &mdash; from 26 to 84, and across East Asian, South Asian, West African, African-American, Native American, Arab, Latino, Native Hawaiian, Filipino and European faces. That set exists to answer one question: does a measurement fail on a particular face, or on everybody?</p>

<p>Seven measurements failed on everybody. Nose width read about 7mm wide on nearly every face, because the mesh&rsquo;s widest alar points sit lateral to the palpated landmark. Nose width over eye spacing landed outside its band on all eighteen. The facial index read low on most, because the photographic silhouette at the temples is wider than the cheekbone. Mouth width, the nose-to-mouth ratio, interpupillary distance and the asymmetry figure all failed the same way.</p>

<p>When a reference rejects the entire population, the reference is wrong, or it is measuring something other than what it claims. All seven were unscored rather than recalibrated, because with eighteen faces there is no honest way to derive a replacement band &mdash; only enough evidence to know the existing one does not hold. Their values are still shown; they simply carry no verdict.</p>

<p>What survives is ten scored measurements, of which nine are counted in the summary. Across the eighteen faces they now average 5.4 typical, 2.9 slightly off and 0.6 well outside per face, and no individual measurement flags a majority of the set. Canthal tilt, which is the most-quoted number in this whole genre, flags nobody: its median across the set is 4.3&deg;, against a published 4.0&ndash;5.8&deg;.</p>

<h2>What is still weak</h2>
<ul>
<li>Eighteen faces is a validation set, not a study. It can show that a measurement fails on everyone; it cannot establish that one works.</li>
<li>The 9.69&deg; pitch correction rests on three photographs.</li>
<li>Six of the eighteen have parted lips, which affects the lower-face measurements. They were kept because dropping them would have removed most of the non-European coverage &mdash; the exact thing the set exists to test.</li>
<li>Nobody in the set is under 26, and only one person is over 70.</li>
<li>Several norms could be verified only through secondary tabulations, because the primary texts are paywalled. Those are marked in the source line.</li>
<li>Three values could not be sourced at all and are shown unscored: the frontal jaw-corner angle, the ramus ratio, and the midface ratio.</li>
</ul>

<h2>Evidence tiers</h2>
<p>Every measurement carries a tag for how solid its reference actually is. This is the part that usually goes missing, and it matters more than any individual number.</p>
<table>
<tr><th>Tier</th><th>What it means</th></tr>
<tr><td><b>Population anthropometry</b></td><td>A published mean and standard deviation from a measured sample — mostly Farkas. You get a real z-score and a real percentile.</td></tr>
<tr><td><b>Clinical planning range</b></td><td>Target ranges surgeons and orthodontists plan against: Powell &amp; Humphreys, Ricketts, Legan &amp; Burstone. Well-established as planning tools, but they are conventions, not distributions.</td></tr>
<tr><td><b>Aesthetic convention</b></td><td>Ideals like equal thirds and the facial fifths. These are Renaissance drawing canons. Farkas tested them against measured faces in 1985 and most are met by a minority of any population — attractive faces included.</td></tr>
<tr><td><b>No clinical basis</b></td><td>Metrics that circulate online with confident numbers attached and no literature behind them. Shown because people ask for them, never scored, and never counted in any summary.</td></tr>
</table>

<h2>What this cannot do</h2>
<ul>
<li><b>Give you a score out of ten.</b> No such number exists to compute. Attractiveness ratings vary by rater, culture, mood and context, and the shared component is dominated by things geometry does not capture — skin condition, expression, grooming, and above all whether the photo caught you mid-blink.</li>
<li><b>Measure bone.</b> Everything here is the skin surface. A soft-tissue jaw angle is not the radiographic gonial angle; a facial convexity angle is not an ANB. Those require a lateral cephalogram.</li>
<li><b>Separate you from the photograph.</b> Focal length, camera height, lighting direction and expression move these numbers more than most anatomy does. Two photos of the same face taken thirty seconds apart can differ by more than two different faces shot identically.</li>
<li><b>Tell you what to change.</b> It can tell you what a measurement is, how common it is, and what class of intervention would move it. Whether anything should move is not a question a measurement can answer.</li>
</ul>

<h2>Getting a photo worth measuring</h2>
<ul>
<li>Camera at eye level, lens at least two metres away, zoomed in. Not arm's length.</li>
<li>Look straight at the lens. Yaw and pitch under 5°.</li>
<li>Neutral expression, lips together but not pressed, eyes open normally, jaw relaxed and teeth lightly together.</li>
<li>Even, diffuse light from the front — an overcast window is close to ideal. Overhead light manufactures under-eye shadows and a hollow midface.</li>
<li>Hair off the forehead and away from the jaw, so the silhouette is the face and not the haircut.</li>
<li>Turn off every beauty filter. Recent phones apply skin smoothing and subtle reshaping by default, and it will measure exactly as if it were your face.</li>
<li>For the profile view: a true 90° turn. If you can see the far eyebrow, the head is not fully turned and every profile angle will read flatter than it is.</li>
</ul>

<h2>Sources</h2>
<ul>
<li>Farkas LG. <i>Anthropometry of the Head and Face</i>, 2nd ed. Raven Press, 1994.</li>
<li>Farkas LG et al. International anthropometric study of facial morphology in various ethnic groups/races. <i>J Craniofac Surg</i> 2005;16(4):615–46.</li>
<li>Farkas LG, Hreczko TA, Kolar JC, Munro IR. Vertical and horizontal proportions of the face in young adult North American Caucasians: revision of neoclassical canons. <i>Plast Reconstr Surg</i> 1985;75(3):328–38.</li>
<li>Powell N, Humphreys B. <i>Proportions of the Aesthetic Face</i>. Thieme-Stratton, 1984.</li>
<li>Ricketts RM. Esthetics, environment, and the law of lip relation. <i>Am J Orthod</i> 1968;54(4):272–89.</li>
<li>Legan HL, Burstone CJ. Soft tissue cephalometric analysis for orthognathic surgery. <i>J Oral Surg</i> 1980;38(10):744–51.</li>
<li>Lefevre CE et al. Telling facial metrics: facial width is associated with testosterone levels in men. <i>Evol Hum Behav</i> 2013;34(4):273–9.</li>
<li>Chu EA et al. Perception of normal facial asymmetry. <i>JAMA Facial Plast Surg</i> 2014;16(2):97–101.</li>
<li>Chaudhary M, Khan A, Gupta M. Skin ageing: pathophysiology and current market treatment approaches. <i>Curr Aging Sci</i> 2020 — ITA background.</li>
<li>Google MediaPipe Face Landmarker — model card and canonical face mesh topology.</li>
</ul>
`;
