# Windows continuation: this local Chromix optimization session

Status: source-only handoff. NO kernel build was run for the new warning change.
This fork includes the local optimization commits and the secret-free chromix-demo
subdirectory. Clone this fork to continue; the original upstream lacks these changes.
Do not copy a macOS binary, out directory, toolchain or object cache to Windows.

## What is reusable

- `chromix-demo/headless-memory-policy.mjs`: headless low-memory runs disable the
  hidden omnibox WebUI/preload and large idle allocator caches. This was the main
  measured improvement (Mac login-page samples ~313–338 MiB, Node excluded).
  UI behavior and cache features are opt-in to headless+low mode; headed profiles
  are not changed. Windows has not been measured; Mac footprint is not Windows
  working set/private bytes and the numbers must not be treated as a Windows claim.
- Node environment separation, fixed seeds, and bounded X login regression are
  portable. The cache-compaction helper currently uses POSIX process/lock checks;
  it is retained in Git for the Mac workflow but MUST NOT be used on Windows until its lock checks are adapted. Create Windows-native profiles/UA;
  do not blindly reuse macOS paths, UA strings, Cocoa launchers, or encrypted data.
- The Windows155 optional overlay ports seven native policies: switch propagation,
  Skia budgets, no always-kept spare, reusable compositor retention limits, safe
  audio idle reset, no explicit spare warmup, and no persistent metric spare file.
  The eighth patch implements the restrictive SOCKS DNS warning exception.
- macOS cold-generator repairs and Metal setup are NOT Windows optimizations.

## Pins and opt-in identity

Windows Chromium: 155.0.8059.39. Core: ffeb45a2bb88bc56a1dfed31410aeb10e9efcd5a.
Windows platform: 989b4382364baaddb8b3180e1eb1030ca96a7273.
Mac Chromium remains 154.0.8037.97; these are separate platform stacks.

The original Windows manifest and its seven entries remain unchanged. Default
Windows selection stays at 231 patches. Set `CHROMIX_WINDOWS_LOW_MEMORY=1` to
select 239 authenticated patches. The preparation/cache key changes accordingly.
The overlay manifest is `build/patch-additions-windows155-low-memory.json`.
Its SHA256 is c68cfc5030a9edbb0ea425be9ce660cf31cc1a2f4c6eb26c5eb801e825e0455e.
Never disable manifest/source validation or rewrite a ready stamp to force resume.

In PowerShell, AFTER reviewing prerequisites in build/windows/build.ps1:

```powershell
$env:CHROMIX_WINDOWS_LOW_MEMORY = '1'
python tools/patch_selection.py --repo . --platform windows --paths
# Run the following only when you are ready to build on Windows:
.\build\windows\build.ps1 -WorkDir C:\chromix-win-opt -Jobs 6 -Arch x64
```

Use a NEW work directory for this changed identity. Existing prepared/restored
231-patch snapshots cannot simply be resumed as 239-patch sources. Historical
recovery/migration tools keep their original pinned identities; do not enable
this overlay during a historical migration or change those tools' hashes. A
future migration of an existing source tree must verify both the old and new
complete stacks before advancing state. No such migration is claimed here.

The preparation script verifies the actual full ungoogled+Windows source tree.
The preflight here checked only pinned upstream files plus the selected Chromix
hunks in eight relevant files, not the complete Windows core/platform patch stack.
Windows compilation/linking and runtime remain PENDING.

## Exact warning behavior

The new native exception applies only when all of the following hold:

- One canonical `socks5://IPv4:port` proxy is explicitly set.
- No no-proxy, PAC, auto-detect, legacy host-rules or additional bypass is set.
  An absent bypass or exactly `<-loopback>` is accepted.
- The resolver rule is exactly `MAP * ~NOTFOUND , EXCLUDE <same IPv4>` (the
  equivalent spelling without the space before the comma is also accepted).

`chromix-demo/native-proxy-options.mjs` supplies the real unquoted argv value.
Do not embed literal shell quotes in the argv value: malformed/quoted rules do
NOT qualify. The exception changes the infobar decision only; it neither removes
nor modifies DNS routing, the proxy, page-visible APIs, certificates or isolation.
Other rules (redirects, extra EXCLUDEs, domain/IPv6 proxies, mismatches, etc.) keep
normal warnings. `--no-sandbox`, certificate-ignore and other bad-flag warnings
are NOT suppressed: the default SDK may therefore still show another warning.

After building, verify the canonical case and negative cases (missing proxy,
HTTP proxy, redirect rule, extra exclusion, mismatch, quotes, PAC, custom bypass).
Confirm proxy exit IP, remote DNS behavior, English UI/page, and user data remain
correct. Do not label banner behavior validated until the new Windows binary runs.

## Node setup on Windows

The repository chromix-demo subdirectory contains a secret-free demo snapshot. It excludes .env, all real
profiles, proxy credentials, cached browsers, artifacts and macOS Cocoa launchers.
Use Node.js 22+ and Python 3.12. In the repository chromix-demo directory:

```powershell
Copy-Item .env.example .env
npm ci
$env:CLOAKBROWSER_VERSION = '155.0.8059.39'
$env:CHROMIX_LOCALE = 'en-US'
$env:CLOAKBROWSER_BINARY_PATH = 'C:\chromix-win-opt\src\out\Chromix\chrome.exe'
npm run env:create -- env-lite --low-memory
$env:CHROMIX_URL = 'https://x.com/login?lang=en'
npm start -- --profile env-lite --headless --native-low-memory
```

For a restored tree the executable may be under out/Default instead; pass the
actual newly built path and retain its complete output/resources directory. Supply a proxy locally if needed; no real credentials
are included in this handoff. The existing Mac English shell wrapper is deliberately
excluded. Windows `--lang=en-US` comes from the saved locale.

## Mandatory validation (after the new binary exists)

```powershell
npm run test:headless-policy
npm run test:proxy-options
npm run test:login-flow
npm run x:login:check -- --binary 'C:\chromix-win-opt\src\out\Chromix\chrome.exe' --screenshot
```

Default: bucai001 + a random test password, expected invalid-password. Require
one actual password submission, a login API response and the explicit password
error. Transparent/inert auxiliary password fields must be excluded. CAPTCHA,
rate limiting, unexpected response, or stopping before the password is NOT PASS.
No automatic retries; use temporary profiles and preserve all real login data.

The included Mac-only memory benchmark uses `footprint` and must not be run as a Windows
memory claim. Measure all browser descendants on Windows separately, excluding
Node, recording working set/private bytes and identical sampling times/inputs.

## Source-only checks available in this snapshot

The separate handoff ZIP evidence (not included in Git) contains the pinned eight-file preimages and the successful
zero-fuzz replay report. You may repeat that limited check without building:

```powershell
python tools/check_windows155_low_memory_preimages.py --preimages '..\evidence\windows155-source-check\pristine' --patch-bin 'C:\path\to\patch.exe' --output 'C:\temp\chromix-source-check.json'
```

This does not replace full preparation verification, compilation or runtime tests.
