# Test results — 2026-10-23

## Results actually obtained

| Check | Result | Evidence |
|---|---|---|
| Upstream guard reproduction | Passed | tests/dearrow.test.mjs |
| Node unit/source integration tests | 33 passed, 0 failed | logs/unit-tests.txt |
| Chromium browser fixture integration | 11 passed, 0 failed | logs/browser-tests.txt |
| Full userscript Rollup build | Passed, 701,840-byte bundle | dist + generated header |
| Built bundle JavaScript syntax | Passed | node --check |
| Native embedded string/header syntax | Passed under g++ C++17 | separate header test only |
| Shell build script syntax | Passed | bash -n |
| Focused native whitespace check | Passed before vendoring | git diff --check |
| Entire patch whitespace check | Upstream whitespace warnings retained | vendored upstream files |
| Live official branding hash API | HTTP 200; 3 titles, 6 thumbnails | logs/live-api.txt |
| Native build preflight | BLOCKED, exit 2 | logs/native-preflight.txt |
| Full native GN/Ninja compile | Not run | insufficient disk/toolchain |
| APK package/signature/compatibility | Not run | no APK exists |
| Android emulator | Not run | no Android emulator/system image |
| Physical Nvidia Shield | Not run | no hardware access |
| Hosted workflow execution | Not run | no authenticated GitHub connector/token |

Environment: Linux, Node 24.19.0, desktop Chromium 141.0.7390.37 via Playwright
1.56.1. This is NOT Android TV emulation. Chromium download first mirror returned
an invalid archive; the vendor fallback mirror succeeded.

## Automated coverage

Title replacement, timestamp-zero thumbnails, missing/negative/original-winning
submissions, moderator locks, malformed timestamps/data, HTTP failure, header/body
timeouts, response deadline, partial completed work, negative/positive caches and
expiry, concurrent deduplication, rate-limit backoff, bounded concurrency/cache,
settings combinations and disabling during a pending response, mismatched IDs,
non-video metadata, nested response families and repeated cards were checked.

Browser tests use actual fetch/XHR networking and browser Image decoding with
controlled response fixtures. They verify prepared content through the actual
patched upstream JSON.parse logic; nonessential UI imports are stubbed. Assertions
check rendered fixture text and an actual rendered image's video-ID URL/decoding.
XHR text/JSON handlers, completion ordering, request reuse, rapid-navigation
fixture rendering, response cloning, disabled mode and unrelated HTTP were tested.

These tests do NOT exercise YouTube's proprietary TV frontend. They do NOT prove
its current schema, initial-data timing or all transports match the fixtures.
The rapid-navigation fixture has a normal navigation generation guard; it is not
evidence that every YouTube navigation implementation uses that guard.

## Failures encountered and resolved

- First unit run: 30/31 passed; an invalid-timestamp test fixture accidentally used
  a default zero for undefined. Corrected the fixture, then 31/31 passed.
- Browser fixture initially had an object-literal syntax error; corrected before
  running the suite. Final 11/11 passed.
- Native inline <script> embedding would be subject to YouTube CSP. Changed the
  source integration to Blink's ClassicScript native API after inspecting its
  actual headers. This integration remains uncompiled against full Blink.

The complete patch retains pre-existing whitespace warnings in the vendored
upstream source. They were not cleaned up as unrelated functional changes.

## Known limitations and acceptance gaps

1. Initial responses consumed before Document::ImplicitClose injection may be
   missed; visible homepage replacement needs live YouTube/Shield verification.
2. Alternate transports and renderer schemas can escape the supported allowlist.
3. Already displayed cards do not restore immediately on toggles; refresh via
   navigation. Thus the immediate-toggle requirement is not fully met.
4. A response has at most 1.2 seconds for preparation. Slow API/image work leaves
   original cards intact. A live probe took 6.9 seconds in this environment; no
   claim is made that fresh fetches pass the budget on the user's connection.
5. Positive cache TTL is per prefix. A missing ID inside a populated prefix uses
   that prefix's TTL. Caches are bounded and reset on application restart.
6. No physical tests of playback, login, seeking, remote navigation, SponsorBlock,
   iSponsorBlockTV discovery/linking, or scrolling performance. Their native/player
   implementation was not intentionally changed, but preservation is not verified.
7. Native C++/GN changes, package identity, SDK minimum and APK signing must be
   tested by a real native build. Compiling the embedded string is not that build.
8. No signing key was generated or published. No APK checksum can be supplied.
9. Workflow YAML is prepared and its constituent JS/test commands were run locally;
   the actual hosted workflow and Node 22 have not been run.

## Checkpoints

| Stage | Status |
|---|---|
| 1. Architecture audit | Passed |
| 2. Root-cause analysis | Passed |
| 3. Implementation | Passed |
| 4. Build infrastructure | Blocked |
| 5. APK packaging | Not started |
| 6. Nvidia Shield testing | Not started |
| 7. Final release | Not started |

Stage 3 Passed means code passes the available checks, as required by Checkpoint 3.
It does not mean functionality or full acceptance is complete. Checkpoints 4–7
have NOT passed. This is a development checkpoint, not a working APK delivery.
