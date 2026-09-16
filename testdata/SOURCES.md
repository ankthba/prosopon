# Sample portraits

These images are **not committed** to this repository and are **not fetched
automatically**. They are photographs of real people, and the local filenames
below do not reliably round-trip to Wikimedia Commons titles — an automated
fetch pulled the wrong image for at least one subject, so that was removed
rather than left to fail quietly.

The app needs none of them: drop in any photo. The set exists only to answer one
question about the tool itself — does a measurement fail on a particular face,
or on everybody?

The set was chosen to span ancestry, sex and age (26 to 84) precisely because
the published anthropometric norms it is tested against were drawn largely from
European and North American samples. A validation set of fourteen similar faces
would have hidden exactly the failures this one was built to find.

To rebuild the set, search Wikimedia Commons for each subject below and take
the frontal official portrait. Open the file's Commons page for the
authoritative licence, author and date. **Check it before
reusing any of these images** — licence terms on Commons can change, and the
notes below record what was true when the set was assembled, not a warranty.

## Licence status as recorded

Fourteen were checked against the Commons API when the set was built:
ten public domain (US federal works, plus an 1885 photograph) and four
CC BY 3.0 (UK Parliament official portraits — attribution required if you
redistribute them).

| File | Subject | Recorded status |
|---|---|---|
| `Official_portrait_of_Barack_Obama.jpg` | Barack Obama | verify on Commons |
| `Katherine_Johnson_1983.jpg` | Katherine Johnson | verify on Commons |
| `Marie_Curie_c._1920s.jpg` | Marie Curie | verify on Commons |
| `Angela_Merkel_2019_cropped.jpg` | Angela Merkel | verify on Commons |
| `Lloyd_Austin_official_portrait_2023.jpg` | Lloyd Austin | public domain (DoD) |
| `Alex_Padilla_Senate_portrait_117th.jpg` | Alex Padilla | public domain (US Senate) |
| `Deb_Haaland_official_portrait_116th.jpg` | Deb Haaland | public domain (US House) |
| `Kai_Kahele_official_portrait_117th.jpg` | Kai Kahele | public domain (US House) |
| `Daniel_Inouye_Senate_portrait_2008.jpg` | Daniel Inouye | public domain (US Senate) |
| `Katherine_Tai_official_portrait.jpg` | Katherine Tai | public domain (USTR) |
| `Eric_Shinseki_official_portrait.jpg` | Eric Shinseki | public domain (US Army) |
| `Antonio_Taguba_official_portrait.jpg` | Antonio Taguba | public domain (US Army) |
| `Sultan_Al_Neyadi_Crew6_portrait.jpg` | Sultan Al Neyadi | public domain (NASA) |
| `Sitting_Bull_1885.jpg` | Sitting Bull (Tȟatȟáŋka Íyotake) | public domain (1885) |
| `Rushanara_Ali_official_portrait.jpg` | Rushanara Ali MP | CC BY 3.0 (UK Parliament) |
| `Zarah_Sultana_official_portrait.jpg` | Zarah Sultana MP | CC BY 3.0 (UK Parliament) |
| `Chi_Onwurah_official_portrait_2024.jpg` | Chi Onwurah MP | CC BY 3.0 (UK Parliament) |
| `Florence_Eshalomi_official_portrait_2024.jpg` | Florence Eshalomi MP | CC BY 3.0 (UK Parliament) |

The first four predate the diverse set and their licences were not
independently re-verified; treat them as "check Commons" like the rest.

## Known limits of this set

- Six of the eighteen have parted lips, which affects mouth width, vermilion
  ratio and the lower-third measurements. They were kept because dropping them
  would have removed most of the non-European coverage — the exact thing the set
  exists to test. They should be excluded from lower-face calibration.
- Nobody is under 26; only one subject is over 70.
- Three images are greyscale and cannot feed the skin-colourimetry module.
- One subject's iris spans only 23px, making his millimetre scale the noisiest
  in the set — prefer his ratios over his absolute figures.
- Eighteen faces is a validation set, not a study. It can demonstrate that a
  measurement fails on everyone. It cannot establish that one works.

## A note on using photographs of real people

These are used as geometry, to test whether a measurement is sound. They are not
ranked, scored against each other, or presented as examples of anything. Please
keep it that way.
