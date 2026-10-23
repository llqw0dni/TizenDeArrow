# Changelog

## 2.0.3-dearrow.1 — unreleased source checkpoint, 2026-10-23

- Replace broken asynchronous model mutation with scoped response preparation.
- Support legacy tileRenderer, modern lockupViewModel and explicit video renderers
  across nested grids, shelves, continuations, search and related response fixtures.
- Respect server ordering, original-winning submissions and moderator locks.
- Accept valid timestamp zero; reject invalid timestamps.
- Check official thumbnail-server images before assigning replacements.
- Preserve originals on missing submissions, errors, timeouts and image failures.
- Deduplicate prefix/API and thumbnail requests with bounded caches and concurrency.
- Add independent title replacement setting without renaming existing preferences.
- Protect prepared thumbnails from subsequent HQ thumbnail rewriting.
- Embed a pinned, built userscript in native source, with YouTube/main-frame scope.
- Set a separate package identity and route updater metadata to the user's fork.
- Add unit, transport and rendered-fixture tests plus a hosted validation workflow.

No APK release, native compile, emulator acceptance or Shield acceptance yet.
