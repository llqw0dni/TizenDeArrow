# Verified architecture and root causes — 23 October 2026

Native base: `295b61e59a11716d0e2050a018b0ae7ac2b90c90` (user fork main;
upstream main is identical). Release tag v2.0.3 resolves to
`9809b5aae6d820c852bc6cf7095304fb1c92f31a`, one commit before the version bump.
The tag still declares version 2.0.2 in BUILD.gn; selecting the following version
bump avoids reproducing that metadata discrepancy.

Userscript base: `reisxd/TizenTube@f99945a84ff767bf14ad8c1146e8e3fd49a3d628`.
This full small source repository is vendored in `dearrow/tizentube`, including
its GPL-3.0 license. Chromium dependencies remain pinned in native DEPS.

## Stage 1 — architecture audit: PASS

Source establishes the following chain:

1. `third_party/blink/renderer/core/dom/document.cc`, `Document::ImplicitClose()`
   injects `https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js`.
   This is Chromium/Blink Cobalt 27, not the older Cobalt web_module engine.
2. `TizenTube/mods/userScript.js` imports `features/adblock.js` alongside the
   existing SponsorBlock, settings, player and remote navigation modules.
3. `mods/features/adblock.js` overrides `JSON.parse` and processes specific
   shelf/continuation response paths. `deArrowify()` starts asynchronous fetches
   and later changes renderer objects.
4. `mods/config.js` persists `ytaf-configuration`; `mods/ui/settings.js` exposes
   enableDeArrow and enableDeArrowThumbnails. There is no separate title toggle.
5. `cobalt/android/BUILD.gn` defines `android_apk("cobalt_apk")`, ARM64 native
   libchrobalt dependencies, package identity, version and signing configuration.
   Output: `out/<configuration>/apks/Cobalt.apk`.
6. `cobalt/build/gn.py` prepares GN arguments for `android-arm64`.
   `cobalt/build/android/package.py` is NOT an appropriate public build wrapper:
   it explicitly inserts `is_cobalt_on_google3 = true`.
7. `.github/workflows/main.yaml` selects self-hosted chrobalt and odt runners;
   `.github/config/android-arm64.json` references internal test targets/device pools.
   It cannot simply be enabled in the public fork to produce an APK.

Sources:
- https://github.com/reisxd/TizenTubeCobalt/blob/295b61e59a11716d0e2050a018b0ae7ac2b90c90/third_party/blink/renderer/core/dom/document.cc
- https://github.com/reisxd/TizenTubeCobalt/blob/295b61e59a11716d0e2050a018b0ae7ac2b90c90/cobalt/android/BUILD.gn
- https://github.com/reisxd/TizenTube/blob/f99945a84ff767bf14ad8c1146e8e3fd49a3d628/mods/features/adblock.js
- https://github.com/reisxd/TizenTube/blob/f99945a84ff767bf14ad8c1146e8e3fd49a3d628/mods/ui/settings.js

## Stage 2 — root-cause analysis: PASS

Confirmed, reproducible from source:

- `if (!item?.lockupViewModel?.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO')`
  compares a boolean to a string and is always true. All items continue before
  making a request. A regression test demonstrates this for both renderer forms.
- The preceding guard skips lockupViewModel-only items as well.
- Thumbnail timestamp `0` is discarded by a truthiness check.
- Re-sorting by votes differs from official server-selected ordering. Official
  DeArrow uses the first candidate and rejects negative votes unless locked;
  an original-winning submission must retain the original rather than select
  another candidate. See DeArrow `src/dataFetching.ts` lines around getVideoTitle
  and getVideoThumbnailIncludingUnsubmitted; the pinned source is in UPSTREAM.json.
- Only named shelves invoke DeArrow. Several grids and grid continuations only
  receive long-press modification, leaving them uncovered.
- Asynchronous changes happen after JSON.parse returns, with no renderer update
  command, no identity guard, no timeout/cache/deduplication, and silent errors.
  Whether a particular live screen observes such changes depends on YouTube's
  renderer; reliable rendering cannot be inferred from object mutation.
- HQ thumbnails are a subsequent model rewrite and can overwrite a replacement
  if the DeArrow pipeline is moved before parsing without a guard.

Deployment verification: npm package 1.15.2 is the published version observed in
this session. The downloaded CDN bundle (692,985 bytes) contains the minified
always-skipping boolean/string guard. This is not merely an unpublished Git bug.

## Community fixes and device reports

- https://github.com/reisxd/TizenTube/issues/366 explicitly reports no DeArrow
  on Nvidia Shield TV Pro. It was open at audit time.
- https://github.com/reisxd/TizenTubeCobalt/issues/173 reports title/thumbnail
  problems on Android TV; closed as not planned is not evidence of a fix.
- Current open/closed PR metadata and source were checked. No fix for the
  deployed always-skipping guard was found in the selected upstream revision.
- Prior session inspection found Altaf's Android fork fixes part of renderer
  selection but still mishandles timestamp zero and late model mutation. The
  user has now reported that fork does not provide working DeArrow on the Shield.
  No claim is made that every fork was freshly re-audited in this continuation.

## API and thumbnail mechanism

Supported hash-prefix lookup:
`GET https://sponsor.ajay.app/api/branding/<first four SHA256 characters>?fetchAll=true`
returns a video-ID-keyed object. Identical prefix requests share in-flight work
and a bounded cache. No unsupported bulk-ID endpoint is introduced.

Community timestamps become images through the official thumbnail server:
`https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=<id>&time=<seconds>`.
No local frame extraction or made-up replacement URL is used. Image decoding is
checked before applying a replacement; negative/original-winning entries retain
YouTube's thumbnail. Frame generation can be unavailable, slow or fail upstream.

## Proposed implementation and its boundaries

`features/dearrow.js` intercepts only supported youtubei JSON routes. Fetch bodies
and asynchronous XHR completion events deliver prepared data before existing
YouTube consumers. Results arriving after a response deadline populate caches
only; they cannot mutate a delivered response. Existing synchronous parsing,
HQ thumbnails, long-press, ad filtering and other TizenTube logic continue after
preparation. This avoids DOM observers and polling.

This is validated with fixture renderers, not the live YouTube TV renderer.
Initial data parsed before userscript injection, alternative transports, private
renderer variants, and currently visible cards after toggling remain unresolved.
Settings apply to subsequent responses; navigating refreshes visible content.
Do not describe these boundaries as universal coverage or hardware acceptance.

## GitHub Actions feasibility

GitHub's standard public ubuntu runners advertise 4 CPUs, 16 GB RAM and 14 GB SSD:
https://docs.github.com/en/actions/reference/runners/github-hosted-runners
Chromium Android documentation requires at least 100 GB free disk and recommends
more than 16 GB RAM:
https://chromium.googlesource.com/chromium/src/+/main/docs/android_build_instructions.md

A standard runner is suitable for the supplied JS/browser validation workflow.
A full source build needs a larger runner or external Linux VM with enough disk.
A practical starting allocation is 8 vCPU, 32 GiB RAM and 200–300 GiB SSD; this is
an engineering allocation, not a measured benchmark. Paid larger runners have
not been provisioned, billed or authorized here. No private upstream jobs are reused.
