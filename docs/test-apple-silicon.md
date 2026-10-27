# Apple Silicon test package

This artifact-only build uses `test/upstream-main-icons-dmg-8568ff0`, separate
from `release.yml`. The upstream snapshot is frozen at
`8568ff001bafcb9e1fd19916ec8c45d57a5ba981` (2026-10-27 11:15 UTC cutoff).
It includes final built-in theme adoption PR #85 at
`3b608355a372ce72522f1eee11fb63c06890edce` and icon PR #2 at
`7cfe50a93d418b3fae0560ad33f49a54dd1af783`, with scoped icon validation fixes.

The product commit is `c50317731f18eadc1baf23e99fa55cf773a0847a` on
`integration/upstream-main-icons` (draft PR #3). It has no test identity,
updater override or test packaging workflow. This test commit is its direct
child; the manifest records both commits. The previous snapshot
`c6858fea9f753c919092783f4b6999bae1eeed7b` and its artifact remain on
`test/upstream-main-icons-dmg`. The new branch has its own concurrency group
and does not cancel that build. No release or tag is created.

## Contents

Solarized Light/Dark and One Light/Dark are built in, following upstream's
final architecture. Their CSS tokens are shared by the frontend and native
frame-color parser. Removed duplicate theme plugins are not restored or bundled.
Select themes in Settings › Appearance or the quick theme menu.

The optional Atom Material Style icon package is bundled under
`Contents/Resources/plugins/icon-theme-atom-material` and supplied in the plugin
ZIP. Install it through Settings › Plugins › Available, then choose Apply Icons.
It is not automatically installed or selected. Icons remain independent of the
color theme. The package contains 120 original MIT SVGs, license, notice and
per-resource provenance.

Download `openidea-test-apple-silicon-<full test SHA>` from the Actions run. It
contains the arm64 DMG, a symlink-preserving app ZIP, offline icon-plugin ZIP,
`SHA256SUMS.txt`, signature metadata, this README and a manifest with source
commits, version, architecture, frontend hashes, built-in CSS/native-parser
hashes and plugin hashes. Artifacts expire after 14 days; GitHub may require
login. Verify with `shasum -a 256 -c SHA256SUMS.txt` before installing.

## Isolation and signing

The name is `OpenIDEA Test`, identifier `com.bghtyu.openidea.test`, distinct
from stable `ai.l0ng.openidea`. App config/data/cache, logs, recent projects,
downloaded tools, plugin storage, window state and single-instance identity
use the test identifier. The source version remains unchanged; the artifact
filename and manifest identify the exact test commit.

The overlay clears updater endpoints/key and disables updater artifacts. A
test-only runtime guard rejects update checks and installation even if the
launching shell sets `OPENIDEA_UPDATE_ENDPOINT`. Normal product configuration
and the formal release pipeline remain unchanged.

The app has an ad-hoc signature only (`signingIdentity: "-"`): no Developer ID,
notarization or updater signing key. macOS may block a downloaded ad-hoc app;
after checking source and checksum, use Privacy & Security's Open Anyway for
this app. Do not disable Gatekeeper globally.

This is app-level isolation, not an OS sandbox. Opening the same project can
change its `.openidea` settings and files; Git, terminals and external tools use
the normal OS environment. Use disposable synthetic projects. The build does
not read or upload user projects or financial data.

## Verification boundaries

A successful job verifies arm64, bundle identifier, ad-hoc signature, four
built-in selectors in built CSS, absence of duplicate theme plugins, exact icon
resources/licenses/provenance, DMG integrity, read-only mounting, mounted binary
equality and mounted resource equality. It does not launch the GUI;
`native_gui_launched` stays false. Packaging checks do not establish native GUI
acceptance.

Local configuration check: `node scripts/test-macos/validate-config.mjs`.
Mac build: `pnpm tauri build --ci --target aarch64-apple-darwin --bundles app --config src-tauri/tauri.test-macos.conf.json`.
Faster compilation settings apply only to this test workflow.
