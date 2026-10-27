# Apple Silicon test package

This branch-only build is separate from `release.yml`. Pushes changing build inputs
on `test/upstream-main-icons-dmg` trigger one macOS 15 arm64 job, pinned to the push SHA.
There is no tag, GitHub Release, Developer ID certificate, notarization or updater
signing key. The `.app` has only a local ad-hoc signature (Tauri `signingIdentity: "-"`).
The workflow token has only `contents: read`; no new credentials are configured.

Download the `openidea-test-apple-silicon-<full SHA>` artifact on the Actions run.
It contains a DMG, the app as a symlink-preserving ZIP, an offline plugin ZIP, `SHA256SUMS.txt`, signature
metadata and a build manifest (exact SHA, version, architecture and frontend asset
hashes). Artifacts expire after 14 days and GitHub may require login to download.
Verify with `shasum -a 256 -c SHA256SUMS.txt`, open the DMG and drag **OpenIDEA Test**
into Applications. It can coexist with OpenIDEA. macOS may block a downloaded
ad-hoc app: after verifying its source/checksum, use macOS Privacy & Security's
Open Anyway for this app. Do not disable Gatekeeper globally. This is not notarized.

## Isolation

This integration includes upstream `c666cee0758341a36f6c648e3f1bca1100f025f6`
and icon PR #2 (`7cfe50a93d418b3fae0560ad33f49a54dd1af783`), plus separately
tracked validation fixes. The product integration is
`5e7812f9b23e6c91cf4c5525c13a08f0f177275c` on `integration/upstream-main-icons`;
it contains no test identity, updater override or test packaging workflow. This
test-package commit descends from that product commit, and the build manifest
records both exact commits. Solarized and One use upstream's plugin architecture;
the older fork-only built-in palettes are retired on this branch. The original
fork `main`, icon PR branch and previous test branch are preserved.

Three offline packages are bundled under `Contents/Resources/plugins` and are
also supplied in the plugin ZIP. In Settings › Plugins › Available, install
Solarized Themes, One Themes or Atom Material Style Icons, then choose Apply or
Apply Icons. They are not automatically installed or selected. Theme and icon
selection remain independent. The test app uses its own plugin storage.

The name is `OpenIDEA Test`; identifier `com.bghtyu.openidea.test` differs from
stable `ai.l0ng.openidea`. Tauri's app config/data/cache paths, logs, shell-path
cache, downloaded tools, recent projects, window state and single-instance identity
use the new identifier. On macOS the app directories are under the platform's
Library locations with that identifier; logs use `~/Library/Logs/<identifier>`.
Some native menu labels still say OpenIDEA. The app version remains the source
version; the artifact filename and manifest identify the exact test commit.

The overlay clears update endpoints/key and disables updater bundles. The runtime
also rejects _all_ update checks/install attempts for this test identifier, even
if `OPENIDEA_UPDATE_ENDPOINT` is set by the launching shell. Formal defaults in
`tauri.conf.json` and the multi-platform release workflow remain unchanged.

This is app-level isolation, not an OS sandbox: opening the same project still
reads/writes its `.openidea` settings and project files, and Git/terminal/external
tools use the user's normal OS environment. Test only with disposable synthetic
projects. The build never reads or uploads user projects or financial data.

## Verification boundaries

A successful job verifies the arm64 executable, bundle identifier, ad-hoc
signature, exact bundled plugin files and licenses, four plugin theme definitions,
120 original icon SVGs and their provenance hashes, DMG integrity,
read-only mounting, and equality/signature of the mounted app. These are packaging
checks, not native GUI acceptance. It does not launch the app or exercise theme
switching on macOS. The manifest's GUI flag remains false. A Linux preview or
cross-platform unit test is not a Mac installation/runtime test.

Local commands: `node scripts/test-macos/validate-config.mjs`; on macOS,
`pnpm tauri build --ci --target aarch64-apple-darwin --bundles app --config src-tauri/tauri.test-macos.conf.json`.
The workflow uses a faster release compilation profile via environment variables;
formal release compilation settings are unchanged.
