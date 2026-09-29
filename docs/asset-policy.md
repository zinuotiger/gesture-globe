# Asset governance

The recovery authorization TASK-007-RECOVERY-001 separates local preparation from public release. It does not reverse the original TASK-007 license finding or grant a model license.

| Type           | Local use                      | Git / release              | Required provenance                                                        |
| -------------- | ------------------------------ | -------------------------- | -------------------------------------------------------------------------- |
| BUNDLED        | Allowed after validation       | Only with verified license | Fixed source/version/hash/size, license ID and evidence URL                |
| EXTERNAL_LOCAL | User-authorized upstream fetch | Never included             | Fixed source/version/hash/size, acquisition receipt, honest license status |
| FIRST_PARTY    | Project-owned asset            | Approved release list      | Author, source and generation method                                       |

`src/config/assets.manifest.json` is the asset inventory, not the task graph. Its releaseFiles is an explicit allowlist of public assets. Every listed entry is validated; missing required local files block development preparation with an assets:fetch instruction. BUNDLED assets missing license evidence always fail. Models cannot be relabeled as Apache-2.0 by editing the manifest. Model NOTICE is checked against the recorded unresolved policy.

`npm run assets:fetch` only fetches registered EXTERNAL_LOCAL entries from the exact authorized Google URL. It logs the URL/version/request time before network I/O, refuses redirects, bounds bytes to the pinned size, verifies actual disk SHA-256, syncs the temporary file and atomically creates the final path with a hard link then unlinks the temporary path. This cross-platform no-clobber promotion preserves an unrelated file created concurrently; unsupported hard links fail explicitly. Interrupted/mismatched downloads remove their own temporary file. Existing files require a matching provenance receipt and integrity check; unknown ones are reported without overwriting. No shell expansion or credentials are used.

The manifest fetchedAt records the first recovery acquisition. Each developer's local receipt records their own acquisition time. Repeating fetch with a verified file/receipt makes no network request and preserves the receipt. A failed attempt is retained as a local ignored diagnostic; it is not accepted as a model. Files and receipts remain under public/models and are excluded by its nested .gitignore. The prior inspection copy under node_modules is left intact, not silently adopted.

`npm run assets:verify` checks schema, source pinning, file integrity, Git tracking, release allowlist and NOTICE. `npm run build` invokes that check and Vite with copyPublicDir=false. Only explicitly approved non-external public assets are copied after bundling; dist is audited and contains release-files.json. The unmodified public directory is available only to the loopback dev server. A production/preview build has no external model and is not a claim that the final gesture application is ready for public hosting.

`npm run release:verify` checks actual dist files (including renamed copies by hash), tracking, manifest and NOTICE. Exit 1 means an invalid asset/distribution; exit 2 means the honest expected BLOCKED_PENDING_LICENSE state. It must not be treated as publication approval or disabled to obtain a green public release. Tests exercise these failures in independent temporary Git repositories inside node_modules/.cache and assert unchanged host HEAD/status/ledger.

The current inventory includes the actual external model, licensed Natural Earth main/fallback map assets, pinned SDK/WASM software and243 Natural Earth city records. Procedural star geometry is first-party source rather than a third-party image. Each actual version/hash/size and classification is recorded in the asset manifest; TASK-102/109/301/603 evidence records acquisition or generation. MS-7 release acceptance must check the complete section 21.4 inventory as well as resolve the model release blocker. No font download is required for system fonts. This recovery adds no production SDK dependency or recognition behavior.

This is a conservative engineering policy, not legal advice. Original evidence remains in `.gesture-globe/evidence/TASK-007.md`.
