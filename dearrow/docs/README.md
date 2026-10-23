# TizenDeArrow — development checkpoint

**No APK has been built. This is not an installable release.**

This source checkpoint adds DeArrow response preparation to TizenTube Cobalt
2.0.3's Chromium/Blink architecture. Architecture, root causes, JavaScript builds,
unit tests and browser fixture integration are verified. Full native compilation,
APK packaging and Shield acceptance remain blocked/unverified.

## What is included

- Native loader changes to run the bundled userscript on the YouTube main frame,
  instead of downloading an unversioned npm script that would erase the fix.
- Full vendored TizenTube userscript source, licenses, lockfiles and built bundle.
- Separate master, title and thumbnail settings, preserving existing config keys.
- Hash-prefix response cache, simultaneous request deduplication, four active
  requests maximum, bounded queues, rate-limit backoff and failure caching.
- Video-ID-scoped response transformation before normal YouTube JSON consumers.
- Actual Chromium XHR/fetch tests and model/rendered-fixture tests.
- A standard GitHub-hosted validation workflow. It DOES NOT produce an APK.

See ARCHITECTURE.md for source links, API behavior and confirmed root causes.

## Prerequisites and source reconstruction

The source archive is a source overlay: all modified native files and the full
vendored JavaScript source. It does not include the entire unchanged Chromium tree.
An attempted full source expansion stalled without transferring a pack and was
stopped; reconstruct the pinned native base before applying the patch. Third-party gitlinks,
SDK, compiler binaries and other Chromium DEPS must still be synchronized.
`dearrow/UPSTREAM.json` records exact native and userscript revisions.

The patch is relative to the user's fork at
`295b61e59a11716d0e2050a018b0ae7ac2b90c90`. Apply with `git apply dearrow-fix.patch`
on that revision, or use `git am` if delivered as a format-patch mail file. The
native files use Chromium's original licenses; vendored TizenTube remains GPL-3.0.

## Reproducing the validated JavaScript build/tests

From the source checkout:

```
npm ci --prefix dearrow/tizentube/mods --ignore-scripts
npm run build --prefix dearrow/tizentube/mods
python3 dearrow/tools/embed-userscript.py
npm ci --prefix dearrow --ignore-scripts
npm test --prefix dearrow
npx --prefix dearrow playwright install --with-deps chromium
npm run test:browser --prefix dearrow
```

These exact dependency locks were used locally. Node 24.19 was tested; the
workflow selects Node 22. Existing Rollup circular dependency warnings remain.
The generated header checksum is verified against the built bundle by a test.

## Native build — not yet validated

A standard GitHub-hosted runner lacks enough disk for full Chromium. Use a Linux
build machine with at least 100 GiB free (200–300 GiB provisioned recommended),
32 GiB RAM and a public Cobalt-compatible dependency checkout. Do not use the
upstream `package.py` wrapper that enables google3-only dependencies.

Install depot_tools, create a Chromium-style `src` solution pointing to the user's
fork/branch, set `target_os = ['android']`, disable `checkout_cobalt_internal` and
`checkout_src_internal`, and synchronize DEPS with gclient. Use the selected
revision's Linux build-dependency installation script, then run hooks. Public
availability of every transitive dependency has NOT been verified end-to-end.

The supplied `dearrow/tools/build-apk.sh` checks resources/toolchains, rebuilds the
bundle, generates its header, runs unit tests, prepares the `android-arm64` gold
configuration, disables remote execution, and builds `cobalt/android:cobalt_apk`.
Expected output is `out/dearrow-arm64/apks/Cobalt.apk`. The script is syntax checked
but cannot be called a working reproducible native build until a real build passes.

The upstream GN file still uses its Android debug keystore path/alias. A future
test build needs that key generated at the path resolved by the native build,
and `apksigner verify --verbose --print-certs` must verify the resulting APK.
A final release should use a dedicated persistent signing key supplied privately,
not committed. No key, certificate or APK exists in this deliverable.

## Intended package and installation — unavailable until Stage 5

- Intended ID: `io.github.llqw0dni.tizendearrow`.
- Intended label: TizenDeArrow.
- Intended version: 2.0.3-dearrow.1 / 20301, ARM64.
- Target device: Nvidia Shield TV Pro, Android TV 9.
- Android compatibility and signing must be verified from the actual APK later.

This separate identity is intended to leave the existing TizenTube installation,
its settings and YouTube authentication intact. The new app will have separate
app data: expect a new YouTube login, independent TizenTube settings, and potentially
separate device linking. No automatic migration or shared authentication is claimed.
No changes were made to the user's server or iSponsorBlockTV configuration.

Do not attempt to install the JavaScript bundle as an APK. Stock Cobalt 2.0.3 has
no verified custom-userscript import mechanism; its native loader selects the npm
URL. The bundle alone cannot be loaded through a documented user setting.

Once a verified APK exists, install its ARM64 APK alongside the original using
the Shield's usual sideloading mechanism, open TizenDeArrow, and sign in. This is
an intended future procedure, not a claim that an installable file is supplied.

## Configuration and functional verification

In YouTube settings open TizenTube settings -> DeArrow settings. Enable DeArrow,
Replace video titles, and DeArrow thumbnails as desired. Thumbnail replacement
remains disabled by default to preserve upstream defaults.

Changes apply to responses received after toggling. Navigate away and back to
refresh existing cards. Immediate restoration of already rendered content is not
implemented. Old settings are retained under `ytaf-configuration` within each app.

Physical testing must use a video confirmed to have a suitable community title
and timestamp. Compare the SAME video ID with all replacements disabled and then
enabled; not every video has submissions. Test home, subscriptions, search,
recommendations, pagination, quick navigation and playback separately. Confirm
playback, seeking, account login, remote buttons and SponsorBlock independently.
No test in this source package constitutes physical-device acceptance.

## Troubleshooting and diagnostics

Console messages begin `[DeArrow]`. Startup should log
`TizenDeArrow response pipeline installed`. Errors preserve original content.
Positive cache TTL: 10 minutes; empty prefix: 1 minute; network errors: 15 seconds;
image success: 10 minutes; image failure: 30 seconds. Caches are session-only and
bounded at 128 entries. HTTP 429 honors numeric Retry-After with bounded backoff.
The response budget is 1.2 seconds; unfinished cards retain original content.

A live API probe succeeded in this environment but took 6.9 seconds, exceeding
that response budget. High latency is an unresolved practical limitation: the
implementation deliberately preserves the original rather than freezing a feed.
The local browser tests use controlled network fixtures, not a claim of low
latency to the public servers or acceptable Shield performance.

If no replacement appears, first distinguish missing submissions, API/image
failure, an unsupported response route, and data consumed before injection.
Capture logs only after a valid APK exists. Do not clear the original app's data.
Do not change iSponsorBlockTV while diagnosing DeArrow.

## Rollback

Keep the original installation installed. Returning to it requires opening its
own launcher entry. If a later test APK is installed, uninstall only TizenDeArrow
to remove its separate data. That also removes its own login and settings, while
the original app's data should remain unaffected. This isolation is based on the
planned distinct package ID and still requires packaged-APK verification.

If the original app was already uninstalled independently, reinstall the upstream
v2.0.3 ARM64 release; removed Android app data and authentication are not restored
by reinstalling. This project does not require uninstalling the original.
