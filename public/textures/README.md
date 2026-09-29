# Earth day texture

`natural-earth-1-3.2.0-day-2048.jpg` is a 2048×1024 derivative of Natural Earth I, shaded relief and water. Raster version 3.2.0, versioned distribution 4.1.1. Natural Earth's map data is public domain under its [official terms](https://www.naturalearthdata.com/about/terms-of-use/). Authors: Tom Patterson, Nathaniel Vaughn Kelso and contributors. This is historical map imagery, not live satellite data.

Fixed source: https://naturalearth.s3.amazonaws.com/4.1.1/50m_raster/NE1_50M_SR_W.zip

The transfer used the NACIS CDN mirror after slow origin transfers, requiring exact Content-Range and matching upstream ETag `23e32ab3cad01b8e805901bb4151a49d`. Archive size: 88413091. Archive SHA-256: `9e85417223414bbed425aea5dca0f0b4c5661fc94d4f14494140a21a08dfa450`. TIFF SHA-256: `22a4d66193002df6d4f1fa59655196cde48eba232fd7f60ed2f3bba5004a65ee`.

Conversion: the original 10800×5400 RGB TIFF was read from the checked ZIP; existing local Pillow 12.1.1 converted RGB, resized with LANCZOS to 2048×1024, and saved JPEG with quality 90, subsampling 0, optimize true. Pillow is an acquisition tool already present on the developer machine, not a project runtime dependency. No AI imagery or synthetic geography was substituted.

Derivative size: 491078. SHA-256: `39200ddb293040b5756c3a6312751cf2633a8ed15840131bd87e9c30d08c2b4a`. The asset manifest is authoritative for build integrity and the release allowlist. The source archive and incomplete transfers remain isolated under ignored `.gesture-globe/asset-source/`; they are not runtime/public assets. Acquisition attempts and final metadata are preserved in TASK-102 reports.

The original sphere UV coordinates agree with the section 18.10 texture-aligned longitude `atan2(-z,x)+offset`, defined only in GeoConvention; the Earth mesh stays fixed. Star positions and atmosphere shader are project-generated source code, not third-party bitmap assets.

This texture is BUNDLED with verified map-data permission. The MediaPipe model remains EXTERNAL_LOCAL, UNRESOLVED and excluded from Git/builds; its public redistribution gate is still blocked.
