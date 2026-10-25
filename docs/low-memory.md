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
- Driver: `chromix-kernel-build/run-build.py` (4 compilation jobs; stop below 20 GiB free).
- Logs/state: `build.log` and `build-state.json` in the build tree.
- Expected binary: `src/out/Chromix/Chromium.app/Contents/MacOS/Chromium`.

Patch syntax/manifest validation and dry-run against pristine version-matching source have passed. The full 235-patch source tree (including pinned cold-build generator path repairs) has passed reverse/forward validation. Related patch-selection tests passed: 54, with 2 optional skips. Native compilation and runtime memory acceptance remain pending.

Do not replace the working downloaded browser until the new executable passes: startup/version checks, an interactive X login-form check, repeated memory samples including all browser descendants (Node excluded), and profile persistence/isolation checks. No login credentials are required for these checks.

Runtime comparison should use the same executable twice, with and without `--uxr-low-memory`, fresh temporary profiles, the same screen/viewport/DPR and the same page-load/interaction schedule. Keep RSS and macOS footprint as separate metrics. Test both the GPU-preserving native budget mode and the explicitly reduced-function software mode; do not label software-only results as preserving native GPU identity.

350 MiB is an acceptance goal, not a measured result of these source changes yet. Login-page results do not establish startup peak or post-login feed/video memory use.

After a successful build, `post-build-acceptance.py` automatically compares native GPU and software-profile modes with the switch off/on, then checks profile persistence. Results are saved in `native-acceptance.log` and `acceptance-state.json`. A report can explicitly finish as `verified-over-budget`; compilation alone does not satisfy the 350 MiB goal.
