# Apple Silicon test package

This branch-only build is separate from `release.yml`. Pushes changing build inputs
on `test/apple-silicon-dmg` trigger one macOS 15 arm64 job, pinned to the push SHA.
There is no tag, GitHub Release, Developer ID certificate, notarization or updater
signing key. The `.app` has only a local ad-hoc signature (Tauri `signingIdentity: "-"`).
The workflow token has only `contents: read`; no new credentials are configured.

Download the `openidea-test-apple-silicon-<full SHA>` artifact on the Actions run.
It contains a DMG, the app as a symlink-preserving ZIP, `SHA256SUMS.txt`, signature
metadata and a build manifest (exact SHA, version, architecture and frontend asset
hashes). Artifacts expire after 14 days and GitHub may require login to download.
Verify with `shasum -a 256 -c SHA256SUMS.txt`, open the DMG and drag **OpenIDEA Test**
into Applications. It can coexist with OpenIDEA. macOS may block a downloaded
ad-hoc app: after verifying its source/checksum, use macOS Privacy & Security's
Open Anyway for this app. Do not disable Gatekeeper globally. This is not notarized.

## Isolation

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
signature, all four new theme selectors in built frontend assets, DMG integrity,
read-only mounting, and equality/signature of the mounted app. These are packaging
checks, not native GUI acceptance. It does not launch the app or exercise theme
switching on macOS. The manifest's GUI flag remains false. A Linux preview or
cross-platform unit test is not a Mac installation/runtime test.

Local commands: `node scripts/test-macos/validate-config.mjs`; on macOS,
`pnpm tauri build --ci --target aarch64-apple-darwin --bundles app --config src-tauri/tauri.test-macos.conf.json`.
The workflow uses a faster release compilation profile via environment variables;
formal release compilation settings are unchanged.
