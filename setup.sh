#!/usr/bin/env bash
# Fetches the two pieces deliberately not committed: the MediaPipe runtime
# (~21MB of wasm) and the face-landmark model (3.6MB).
#
# The validation portraits are NOT fetched automatically. They are photographs
# of real people under a mix of licences, and the Commons filenames do not
# reliably round-trip from the local names — an automated fetch was pulling the
# wrong images. See testdata/SOURCES.md if you want to rebuild that set by hand.
# The app itself needs none of them; drop in any photo.
set -euo pipefail
cd "$(dirname "$0")"

MP_VERSION="1.0.1"
CDN="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}"

echo "→ MediaPipe tasks-vision ${MP_VERSION}"
mkdir -p vendor/tasks-vision/wasm
curl -sSfL -o vendor/tasks-vision/vision_bundle.mjs "${CDN}/vision_bundle.mjs"
for f in vision_wasm_internal.js vision_wasm_internal.wasm \
         vision_wasm_nosimd_internal.js vision_wasm_nosimd_internal.wasm; do
  curl -sSfL -o "vendor/tasks-vision/wasm/$f" "${CDN}/wasm/$f"
done

echo "→ face_landmarker.task"
mkdir -p models
curl -sSfL -o models/face_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

echo
echo "Done. Start it with:  python3 -m http.server 8777"
echo "Then open:            http://127.0.0.1:8777/"
