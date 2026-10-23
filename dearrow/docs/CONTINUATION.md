# Continuation checkpoint — 23 October 2026

## Current stage

Stage 4, build infrastructure: BLOCKED. Do not proceed to APK verification,
physical-device acceptance or release until a native build actually succeeds.

| Stage | Status |
|---|---|
| 1. Architecture audit | Passed |
| 2. Root-cause analysis | Passed |
| 3. Implementation | Passed |
| 4. Build infrastructure | Blocked |
| 5. APK packaging | Not started |
| 6. Nvidia Shield testing | Not started |
| 7. Final release | Not started |

## Completed and evidence

Architecture/root causes are in ARCHITECTURE.md. Thirty-three Node tests and eleven
Chromium fixture integration tests passed; see TEST_RESULTS.md and dearrow/logs.
Full userscript built successfully (701,840 bytes). Embedded header compiled as a
standalone C++17 translation unit; full native Cobalt/Blink has NOT compiled.
Live branding hash API returned HTTP 200, but took 6.9 seconds in this environment.

Fork: https://github.com/llqw0dni/TizenDeArrow
Selected native base: 295b61e59a11716d0e2050a018b0ae7ac2b90c90
Release tag v2.0.3: 9809b5aae6d820c852bc6cf7095304fb1c92f31a
Userscript base: f99945a84ff767bf14ad8c1146e8e3fd49a3d628
Local branch: dearrow-fix. A local commit/patch may accompany this checkpoint;
consult GIT_CHECKPOINT.txt in the deliverable for its final hash. Nothing was pushed.
No authenticated GitHub connector or CLI token is available in this environment.

## Modified files

- cobalt/android/BUILD.gn: distinct package/version; existing debug signing remains.
- cobalt/shell/android/shell_apk/AndroidManifest.xml.jinja2: launcher label.
- third_party/blink/renderer/core/dom/document.cc: bundled main-frame native script.
- third_party/blink/renderer/core/dom/build.gni: generated header in native target.
- .github/workflows/dearrow-validation.yml: hosted JavaScript/browser tests only.
- dearrow/tizentube/: full vendored userscript source. Changes inside it:
  features/dearrow.js, features/dearrowInit.js, features/adblock.js,
  config.js, ui/settings.js, translations/resources/en.json, features/updater.js,
  and built dist/userScript.js. Paths above are under mods/ except dist/.
- dearrow/generated/userscript.h, tools/, tests/, docs/, logs/, lockfiles and
  UPSTREAM.json support this checkpoint.

The native source tree still requires third-party gitlinks and DEPS downloads.
Do not mistake an extracted source archive for a synchronized Chromium build.

## Key commands executed

- Shallow sparse clone of the existing fork, plus upstream v2.0.3 tag fetch.
- Clone of TizenTube and DeArrow reference sources; inspect native loader/build.
- npm ci --prefix dearrow/tizentube/mods --ignore-scripts
- npm run build --prefix dearrow/tizentube/mods
- python3 dearrow/tools/embed-userscript.py
- npm test --prefix dearrow
- npx --prefix dearrow playwright install chromium
- npm run test:browser --prefix dearrow
- g++ -std=c++17 -I. <header test> -o <temporary test executable>
- node --check dearrow/tizentube/dist/userScript.js
- bash -n dearrow/tools/build-apk.sh
- python3 dearrow/tools/preflight.py: exit 2, BLOCKED.

No home server SSH commands, Docker changes, Actions dispatches, GitHub pushes,
Android installs or iSponsorBlockTV edits were performed.

## Exact blockers

Local environment had 28.6 GiB free at preflight; full Chromium documentation
requires at least 100 GiB. gn/autoninja/gclient/SDK/Clang dependencies were absent.
Standard public Actions storage is 14 GB. Upstream reusable workflows require
private self-hosted runners and device pools. No hosted native build was run.
No APK or signing certificate exists, so there is no APK checksum to report.

## Exact next action

Provision/select a Linux build runner with sufficient disk/RAM (for example a
GitHub larger runner with 200–300 GiB disk and 32 GiB RAM), without enabling paid
resources automatically. Commit/upload this prepared branch using the user's
GitHub access if available. Synchronize public Cobalt Android dependencies at the
recorded revision, then run the supplied build script and resolve actual failures.
The script is unvalidated end-to-end; --no-rbe is required for public builds.

Before calling Stage 4 passed, compile full native source including the new header
ownership in dom/build.gni and native ClassicScript call. Before Stage 5 passes,
inspect package ID/minSdk/ARM64 contents and verify signature. Then test on the
user's Shield one action at a time. Initial home data timing, live renderer schema,
settings restoration and high latency remain explicit acceptance gaps.
