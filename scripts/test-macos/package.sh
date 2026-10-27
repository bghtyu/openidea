#!/usr/bin/env bash
set -euo pipefail
app='target/aarch64-apple-darwin/release/bundle/macos/OpenIDEA Test.app'
name="OpenIDEA-Test-$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")-arm64-${GITHUB_SHA:0:12}"
mkdir -p test-artifacts
test "$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")" = "$(node -p 'JSON.parse(require("fs").readFileSync("src-tauri/tauri.conf.json")).version')"
binary="$app/Contents/MacOS/openidea"
test "$(lipo -archs "$binary")" = arm64
test "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Contents/Info.plist")" = com.bghtyu.openidea.test
codesign --verify --deep --strict --verbose=2 "$app"
codesign -dv --verbose=4 "$app" 2> test-artifacts/signature.txt
grep -q 'Signature=adhoc' test-artifacts/signature.txt
python3 scripts/test-macos/verify-resources.py "$app/Contents/Resources"
stage=$(mktemp -d)
mount=$(mktemp -d)
cleanup() { hdiutil detach "$mount" -quiet 2>/dev/null || true; rm -rf "$stage" "$mount"; }
trap cleanup EXIT
ditto "$app" "$stage/OpenIDEA Test.app"
ln -s /Applications "$stage/Applications"
hdiutil create -volname 'OpenIDEA Test' -srcfolder "$stage" -format UDZO -ov "test-artifacts/$name.dmg"
hdiutil verify "test-artifacts/$name.dmg"
hdiutil attach "test-artifacts/$name.dmg" -readonly -nobrowse -mountpoint "$mount"
test "$(lipo -archs "$mount/OpenIDEA Test.app/Contents/MacOS/openidea")" = arm64
cmp "$binary" "$mount/OpenIDEA Test.app/Contents/MacOS/openidea"
codesign --verify --deep --strict "$mount/OpenIDEA Test.app"
diff -r "$app/Contents/Resources/plugins" "$mount/OpenIDEA Test.app/Contents/Resources/plugins"
hdiutil detach "$mount"
python3 - <<'PYVERIFY'
from pathlib import Path
import json
p=Path('test-artifacts/build-manifest.json')
m=json.loads(p.read_text());m['verification']['dmg_mount']=True
p.write_text(json.dumps(m,indent=2)+'\n')
PYVERIFY
# ZIP preserves the app bundle layout and symlinks across artifact download.
ditto -c -k --sequesterRsrc --keepParent "$app" "test-artifacts/$name.app.zip"
ditto -c -k --keepParent "$app/Contents/Resources/plugins" "test-artifacts/$name.plugins.zip"
cp docs/test-apple-silicon.md test-artifacts/README.md
(cd test-artifacts && shasum -a 256 ./*.dmg ./*.app.zip ./*.plugins.zip build-manifest.json signature.txt README.md > SHA256SUMS.txt)
cat test-artifacts/SHA256SUMS.txt
