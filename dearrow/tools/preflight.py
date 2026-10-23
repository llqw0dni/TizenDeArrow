#!/usr/bin/env python3
"""Fail early rather than downloading Chromium dependencies onto a small runner."""
import shutil, sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
free=shutil.disk_usage(root).free / 1024**3
issues=[]
print(f'Free disk: {free:.1f} GiB; full Chromium build requires at least 100 GiB free')
if free < 100: issues.append('insufficient disk for Chromium dependency checkout and build')
for tool in ['gn','autoninja','gclient','node','npm','java']:
    path=shutil.which(tool)
    print(f'{tool}: {path or "MISSING"}')
    if path is None: issues.append(f'missing {tool}')
for dep in ['build/config/android/config.gni','third_party/android_sdk/public', 'third_party/llvm-build/Release+Asserts/bin/clang']:
    if not (root/dep).exists(): issues.append(f'missing synchronized dependency: {dep}')
if issues:
    print('BLOCKED:\n- '+'\n- '.join(issues));sys.exit(2)
print('Preflight passed; this is not proof of build success.')
