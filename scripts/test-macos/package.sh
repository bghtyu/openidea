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
python3 - <<'PY'
from pathlib import Path
import json,hashlib,os
assets={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('dist').rglob('*') if p.is_file()}
css='\n'.join(p.read_text() for p in Path('dist').rglob('*.css'))
for theme in ['solarized-light','solarized-dark','one-light','one-dark']:
    assert theme in css, f'Missing theme in frontend assets: {theme}'
base=json.loads(Path('src-tauri/tauri.conf.json').read_text())
Path('test-artifacts/build-manifest.json').write_text(json.dumps({'sha':os.environ['GITHUB_SHA'],'run_url':f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/actions/runs/{os.environ["GITHUB_RUN_ID"]}','version':base['version'],'architecture':'arm64','identifier':'com.bghtyu.openidea.test','signing':'ad-hoc, not Developer ID; not notarized','verification':{'app_architecture':True,'app_signature':True,'built_frontend_themes':True,'dmg_mount':False,'native_gui_launched':False},'frontend_assets':assets},indent=2)+'\n')
PY
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
cp docs/test-apple-silicon.md test-artifacts/README.md
(cd test-artifacts && shasum -a 256 ./*.dmg ./*.app.zip build-manifest.json signature.txt README.md > SHA256SUMS.txt)
cat test-artifacts/SHA256SUMS.txt
