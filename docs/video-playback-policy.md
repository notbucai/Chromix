# Opt-in video playback restriction

Status: source only. No build, playback runtime PASS or memory saving is claimed.
Mac154 and opted-in Windows155 additions include this patch; Linux is not changed.

The standalone browser switch is `--uxr-disable-video-playback`. Without it,
normal video behavior remains unchanged, including when `--uxr-low-memory` is set.
It is propagated to child renderers. Restart without the switch to restore video.

With the switch, HTML `<video>` resource loading stops before player creation,
and `play()` rejects with `NotSupportedError`. This covers URL/source elements,
autoplay/manual play, MediaSource and MediaStream/srcObject playback in that
element. Audio attached to a video is also unavailable. Standalone `<audio>` and
Web Audio are not blocked. Login storage, seed and existing profiles are untouched.
No JavaScript API shim or fingerprint codec-list change is made. The playback
failure is observable to websites; this is an explicit feature restriction.

This is NOT a general network/video-data firewall. Script fetches, Service Worker
cache writes, video posters, animated images, WebCodecs-to-canvas and background
WebRTC processing are not blocked. Existing caches are not deleted. Savings depend
on the page actually playing video and require measurement on the target platform.

## Launch the newly built binary

Set `CLOAKBROWSER_BINARY_PATH` to a newly built executable containing the patch.
From chromix-demo, use:

```
npm start -- --profile env-lite --disable-video
```

Or save the JSON boolean `"disableVideoPlayback": true` in a closed environment's
configuration. Do not alter seed, browserVersion, display or login storage. A new
environment can be created with `npm run env:create -- NAME --disable-video`.
To allow video for one launch, use `--enable-video`; this overrides the saved
setting in memory. Remove the saved setting or set it to false for future launches.
No existing environment was changed or restarted while implementing this patch.

## Required native validation after building

Use the actual new executable, with isolated temporary data. First test without
the switch: valid video URL/blob/MSE/srcObject playback, autoplay (under the
normal user-gesture policy), and audio must work. Then test with the switch:
video play promises reject, no player starts and no media-element URL fetch is
issued; repeat with child frames and dynamic source changes. Test standalone
audio/Web Audio still play, pages finish loading, and removing the switch restores
video. Do not mistake an unsupported fixture codec for policy success. Compare
identical pages/intervals for memory and network; exclude Node. These native
checks remain pending until the new binary is built.

Run `npm run test:video-options` for launch-option checks. Also run the mandatory
login fixture tests and ONE live login-flow regression using that new executable.
An old binary silently ignoring the switch cannot validate this feature.
