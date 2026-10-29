"""Ensure the test overlay leaves the exact PR4 product tree intact."""
from pathlib import Path
import hashlib
import subprocess

PRODUCT = 'b3a6c4bd9f493fa8748be9fb4e5f22268524e8b6'
ALLOWED = {
    '.github/workflows/test-apple-silicon.yml',
    'docs/test-apple-silicon.md',
    'scripts/test-macos/package.sh',
    'scripts/test-macos/validate-config.mjs',
    'scripts/test-macos/verify-resources.py',
    'scripts/test-macos/verify-source.py',
    'src-tauri/tauri.test-macos.conf.json',
    'src-tauri/src/commands/window.rs',
}
changed = set(subprocess.check_output(['git', 'diff', '--name-only', PRODUCT, 'HEAD']).decode().splitlines())
assert changed <= ALLOWED, f'Unexpected product modifications: {changed - ALLOWED}'
# The sole Rust change is the reviewed test-identity updater guard plus its test.
assert hashlib.sha256(Path('src-tauri/src/commands/window.rs').read_bytes()).hexdigest() == '230d13492b2839e99c5c20bae39ff8361580de11461d837207aa584f52955154'
assert not subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no']).strip(), 'Dirty tracked sources'
print(f'Exact product source {PRODUCT}; only isolated packaging overlay differs')
