# Third-party asset notices

## Three.js software

Three.js 0.180.0, MIT, copyright 2010-2025 Three.js authors. License text retained in docs/licenses/THREE-MIT.txt, copied from the exact installed package LICENSE. This software dependency is fixed by the MS-0 build baseline; it is not a license for external map/model assets.

## MediaPipe Tasks Vision SDK

Version 0.10.32, installed as part of TASK-008's reproducible dependency baseline. License: Apache-2.0, SDK / software code only. Evidence: the npm package license field and the MediaPipe source LICENSE at https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE. The maintainer confirms Web SDK licensing at https://github.com/google-ai-edge/mediapipe/issues/6306#issuecomment-4673728357. This SDK statement does not establish a license for the Gesture Recognizer model weights.

## Natural Earth map texture

Made with Natural Earth. Natural Earth I shaded relief and water raster 3.2.0, obtained from the versioned 4.1.1 distribution. Authors: Tom Patterson, Nathaniel Vaughn Kelso and Natural Earth contributors.

Official map-data terms: https://www.naturalearthdata.com/about/terms-of-use/
Product/version: https://www.naturalearthdata.com/downloads/50m-raster-data/50m-natural-earth-1/
Fixed source: https://naturalearth.s3.amazonaws.com/4.1.1/50m_raster/NE1_50M_SR_W.zip
Transport mirror: https://naciscdn.org/naturalearth/50m/raster/NE1_50M_SR_W.zip (identical size and upstream ETag, checked with If-Match).

The map data is explicitly public domain under the upstream terms, including modification and redistribution. Inventory classification: BUNDLED / VERIFIED / LicenseRef-Natural-Earth-Public-Domain. This applies only to the Natural Earth map data. No model license is inferred.

Project derivative: public/textures/natural-earth-1-3.2.0-day-2048.jpg, 2048x1024, 491078 bytes. SHA-256: 39200ddb293040b5756c3a6312751cf2633a8ed15840131bd87e9c30d08c2b4a. Conversion recipe and archive/TIFF hashes are in the asset manifest and public/textures/README.md. The project-authored shader and deterministic star geometry are source code, with no external star image asset.

This texture is allowed in the local build. Project public release remains BLOCKED_PENDING_LICENSE for the separately governed MediaPipe model.

## MediaPipe SDK local WASM runtime

The four JS/WASM files in public/models/mediapipe-0.10.32 are unmodified software files copied from the already installed, lockfile-pinned @mediapipe/tasks-vision 0.10.32 package. SDK package metadata explicitly declares Apache-2.0. Package integrity, per-file SHA-256 and sizes are recorded in assets.manifest.json. Standard Apache-2.0 terms are retained as LICENSE.txt in that directory (line endings and trailing whitespace normalized without changing the legal text); the text came from the existing TypeScript LICENSE.txt, while SDK licensing evidence is the SDK's own package declaration. No download was performed for this copy operation. This does not assign any license to gesture_recognizer.task.

## Gesture Globe worker bootstrap

public/models/vision-worker-bootstrap.js is original project code by Gesture Globe contributors. It loads the same-origin Vite worker entry in a classic Dedicated Worker; it contains no model weights. SDK license and unresolved model policy remain separate.

## Natural Earth city points

Made with Natural Earth. Populated Places 1:110m, version5.1.2,243 records. Original contributors: Tom Patterson, Nathaniel Vaughn Kelso and Natural Earth contributors. Official terms https://www.naturalearthdata.com/about/terms-of-use/ explicitly place the map data in the public domain, allowing modification and redistribution. This applies only to Natural Earth data.

Source: https://naturalearth.s3.amazonaws.com/5.1.2/110m_cultural/ne_110m_populated_places.zip
Archive SHA-256: 29b901a2ae0a745741c0642123480e31101ed723086c4d0cae657a8d722c3b28
Derivative: public/data/cities-natural-earth-5.1.2.json; SHA-256: 74ce4197efe312c7e36722a74392f52f4dab64211e16fab9db9d7a3db626e38b.

BUNDLED / VERIFIED / LicenseRef-Natural-Earth-Public-Domain. Recipe and limitations: public/data/README.md. No claim of complete/current city coverage or geocoding precision. Model license below remains unresolved.

## MediaPipe Gesture Recognizer model

Source: https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task
Version: gesture_recognizer/float16/1
SHA-256: 97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482
Model card: https://storage.googleapis.com/mediapipe-assets/gesture_recognizer/model_card_hand_gesture_classification_with_faireness_2022.pdf

License status: UNRESOLVED. 本项目不主张该模型采用 Apache-2.0。
当前资料证明了官方来源和预期使用方式，但没有被本项目解释为模型二进制的明确再分发许可。

EXTERNAL_LOCAL; redistributionAllowed=false; committed=false; releaseStatus=BLOCKED_PENDING_LICENSE.
本项目不随源代码或发布包再分发该模型。开发者通过 npm run assets:fetch 从官方上游单独下载用于本地开发与测试。获得明确再分发依据前，公开发布门禁保持阻塞。SDK 许可证不覆盖本项目对模型权重的许可判断。
