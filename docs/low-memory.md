# Opt-in native memory budgets (Mac ARM64 experiment)

This local branch adds `--uxr-low-memory` to the pinned Chromium 154.0.8037.97 macOS build. The switch is copied to child processes, so GPU and renderer budgets agree with the browser. It is independent of fingerprint seeds and does not disable site isolation, sandboxing, JavaScript, Canvas or WebGL.

With the switch enabled:

- Ganesh resource cache budget: 32 MiB; glyph cache texture budget: 2 MiB.
- Graphite GPU-main image provider budget: 4 MiB; compositor provider: 1 MiB.
- Do not keep a spare renderer process alive at all times.
- Reusable compositor resource retention expires after at most 500 ms; resource pool budget is capped at 16 MiB. Resources currently in use are never evicted to satisfy this retention budget.

Without the switch, existing budget and spare-process logic is preserved. The values are cache policies, not a hard cap on the browser's total memory. Oversized active pages can still exceed the target. Smaller caches may increase rasterization and upload work.

The four changes are registered as per-file macOS154 additions (0227–0230) with individual SHA256s and a pinned manifest digest. Existing common patch series and version/core/platform pins remain intact.

## Build and evidence

- Source repository: `/Users/bucai/projects/x-tools/chromix-kernel`
- Build tree: `/Users/bucai/projects/x-tools/chromix-kernel-build`
- Driver: `chromix-kernel-build/run-build.py` (6 compilation jobs; stop below 20 GiB free).
- Logs/state: `build.log` and `build-state.json` in the build tree.
- Expected binary: `src/out/Chromix/Chromium.app/Contents/MacOS/Chromium`.

Patch syntax/manifest validation and dry-run against pristine version-matching source have passed. The full 235-patch source tree (including pinned cold-build generator path repairs) has passed reverse/forward validation. Related patch-selection tests passed: 54, with 2 optional skips. Native compilation and runtime memory acceptance remain pending.

Do not replace the working downloaded browser until the new executable passes: startup/version checks, an interactive X login-form check, repeated memory samples including all browser descendants (Node excluded), and profile persistence/isolation checks. No login credentials are required for these checks.

Runtime comparison should use the same executable twice, with and without `--uxr-low-memory`, fresh temporary profiles, the same screen/viewport/DPR and the same page-load/interaction schedule. Keep RSS and macOS footprint as separate metrics. Test both the GPU-preserving native budget mode and the explicitly reduced-function software mode; do not label software-only results as preserving native GPU identity.

350 MiB is an acceptance goal, not a measured result of these source changes yet. Login-page results do not establish startup peak or post-login feed/video memory use.

After a successful build, `post-build-acceptance.py` automatically compares native GPU and software-profile modes with the switch off/on, then checks profile persistence. Results are saved in `native-acceptance.log` and `acceptance-state.json`. A report can explicitly finish as `verified-over-budget`; compilation alone does not satisfy the 350 MiB goal.


## Second local optimization round

Round 1 built successfully and passed login-form/persistence checks, but missed
350 MiB (software profile 446–473 MiB, native budget variant 448–475 MiB).
The following second-round policies remain opt-in through `--uxr-low-memory`:

- Audio service: configure Mojo idle reset before any child interfaces bind.
  Only no-live-interface/no-in-flight-message states may disconnect after 5 s.
  Device watchers, streams and outstanding callbacks must keep the service alive.
  No unconditional service kill or permission filtering is introduced.
- Suppress explicit spare-renderer warmups as well as always-kept spares. Site
  isolation and on-demand site-locked process creation are unchanged.
- Do not allocate crash-persistent histogram storage or its 4 MiB spare file.
  Ordinary in-memory histograms remain available; persistent diagnostic history
  across a crash is the explicit tradeoff. Existing metrics files are untouched.

V8 memory-saver/shorter-GC-delay flags and removing already-blocked third-party
iframes were tested separately and are NOT enabled by default: the first probe
showed no convincing steady-state benefit. No hard heap cap is imposed.

`CHROMIX_OUTPUT_NAME=ChromixRound2` uses an independent APFS-cloned output;
`out/Chromix` and the first working Chromium.app are retained. Full exact patch
reverse/forward verification must succeed before advancing the source preparation
stamp to the new authenticated manifest. Native build concurrency stays at six.

The Node demo's low-memory mode caps disk/media caches (4/1 MiB nominal limits).
`profile-maintenance.mjs` moves only explicitly allowlisted reconstructible caches
to a private backup, refuses active/locked profiles, verifies all retained files
and environment configuration hashes, and supports conflict-refusing restore.
It never removes Cookie, Local Storage, IndexedDB, Service Worker, preference,
encryption-key or fingerprint data. Moving to backup reduces the live profile's
size but does not free total disk space. Live profiles are deferred until closed.
