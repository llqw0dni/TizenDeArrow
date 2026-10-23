#!/usr/bin/env bash
# Run from a complete, gclient-synchronized checkout. Not validated end-to-end.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 dearrow/tools/preflight.py
npm ci --prefix dearrow/tizentube/mods --ignore-scripts
npm run build --prefix dearrow/tizentube/mods
python3 dearrow/tools/embed-userscript.py
npm ci --prefix dearrow --ignore-scripts
npm test --prefix dearrow
python3 cobalt/build/gn.py out/dearrow-arm64 -p android-arm64 -c gold --no-rbe
# Explicitly disable internal distributed compilation services.
printf '\nuse_remoteexec = false\nuse_siso = false\n' >> out/dearrow-arm64/args.gn
gn gen out/dearrow-arm64
autoninja -C out/dearrow-arm64 cobalt/android:cobalt_apk
python3 - <<'PY'
from pathlib import Path
import hashlib, zipfile
apk=Path('out/dearrow-arm64/apks/Cobalt.apk')
if not apk.is_file(): raise SystemExit('Expected APK was not produced')
with zipfile.ZipFile(apk) as archive:
    if archive.testzip(): raise SystemExit('Invalid APK ZIP')
    if not any(p.startswith('lib/arm64-v8a/') for p in archive.namelist()):
        raise SystemExit('Missing ARM64 native libraries')
print(apk, apk.stat().st_size, hashlib.sha256(apk.read_bytes()).hexdigest())
PY
