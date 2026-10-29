# Apple Silicon PR4 font test package

This artifact-only build uses `test/pr4-fonts-dmg-b3a6c4b`, separate from
`release.yml`. The exact product source is PR #4 (`feat/system-font-discovery`)
at `b3a6c4bd9f493fa8748be9fb4e5f22268524e8b6`, incorporating upstream main
`8ebeaa26637b68b20fa2ceed1243d251af951cf7` and preserving the fork themes/icons.
Only the isolated packaging overlay was adapted from
`eedd3ea0974a1b8b03feeff8243ec4b24c2d9636` (successful historical run
40498601927); no old product source was transplanted.

The workflow verifies the exact product tree outside an explicit packaging
allowlist and records font source hashes, product and packaging SHAs.
Native font discovery, searchable/manual family selection, bundled aliases and
quiet candidate fallback are from the unmodified PR4 product source. The only
Rust overlay is the test-identity updater guard and its regression test.
No PR is merged and no release or tag is created.

Packaging runs build and installation-package generation only, followed by
source/configuration, bundle, DMG and checksum checks. Behavioral tests belong
in test CI and are not packaging prerequisites. No extra test, lint or
typecheck suite is invoked by this workflow.

## Contents

Solarized Light/Dark and One Light/Dark are built in, following upstream's
final architecture. Their CSS tokens are shared by the frontend and native
frame-color parser. Removed duplicate theme plugins are not restored or bundled.
Select themes in Settings › Appearance or the quick theme menu.

The icons and built-in themes remain exactly those in PR4's product tree.
Unmerged icon PR #2 is not included. No extra plugin package is bundled.

The app's Resources directory also contains the complete root
`THIRD_PARTY_LICENSES.md` (including the built-in palette MIT notices), `LICENSE`
and `NOTICE`. Verification requires byte equality with the source checkout,
records SHA-256 hashes, and checks equality again inside the mounted DMG.

Download `openidea-test-apple-silicon-<full test SHA>` from the Actions run. It
contains the arm64 DMG, a symlink-preserving app ZIP,
`SHA256SUMS.txt`, signature metadata, this README and a manifest with source
commits, version, architecture, frontend hashes, built-in CSS/native-parser
hashes and font source hashes. Artifacts expire after 14 days; GitHub may require
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
built-in selectors in built CSS, absence of duplicate theme plugins, bundled font assets, bundled root notices and their hashes, DMG
integrity, read-only mounting, mounted binary
equality and mounted resource equality. It does not launch the GUI;
`native_gui_launched` stays false. Packaging checks do not establish native GUI
acceptance.

Local configuration check: `node scripts/test-macos/validate-config.mjs`.
Mac build: `pnpm tauri build --ci --target aarch64-apple-darwin --bundles app --config src-tauri/tauri.test-macos.conf.json`.
Faster compilation settings apply only to this test workflow.
