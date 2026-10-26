# Chromix regression requirement

The user explicitly requires the X login-flow regression after every completed batch of changes to this project (scripts, launch options, configuration or native kernel).

- From `/Users/bucai/projects/x-tools/chromix-demo`, run `npm run test:login-flow` and one `npm run x:login:check` after the batch is ready.
- When changing/rebuilding a kernel, pass `-- --binary /absolute/path/to/the/new/Chromium.app/Contents/MacOS/Chromium`. An old executable is not validation of a new build.
- Default case: `bucai001`, random test password, expected `invalid-password`. PASS requires one password submission, a login API POST response, and the expected explicit rejection. Page loading alone is insufficient.
- Preserve single-submit behavior. Do not auto-retry against X, bypass challenges, loosen expectations to make a failure pass, or use an existing logged-in profile.
- Keep the user's real login data, fixed fingerprints and current browser windows intact. The verifier uses temporary data.
- Check the exit code and `artifacts/login-flow-regression/latest.json`; report the tested binary, outcome and any failure/incomplete/blocked state. If the new binary is not built yet or network/site conditions prevent verification, clearly state that validation remains incomplete instead of claiming PASS.
- `verify-x-login-flow.mjs` is the CLI; `login-flow.mjs` implements the bounded flow. Local fixture tests do not submit to X. See README for options and report paths.

Windows continuation: use the corresponding Windows chromix-demo checkout instead of the Mac absolute directory. See `docs/windows-session-handoff.md` in the kernel snapshot. Do not use macOS binaries/paths to validate Windows changes; no new native runtime PASS may be claimed before the new Windows binary is built.
