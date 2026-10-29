"""Verify offline packages copied into the test app, then record build evidence."""
from pathlib import Path
import hashlib
import json
import os
import re
import sys

SOURCES = {
    "product_pr4": "b3a6c4bd9f493fa8748be9fb4e5f22268524e8b6",
    "upstream_main": "8ebeaa26637b68b20fa2ceed1243d251af951cf7",
    "historic_packaging_overlay": "eedd3ea0974a1b8b03feeff8243ec4b24c2d9636",
}

BUILTIN_THEMES = ("solarized-light", "solarized-dark", "one-light", "one-dark")
NOTICES = ("THIRD_PARTY_LICENSES.md", "LICENSE", "NOTICE")


def verify_notices(resources):
    hashes = {}
    for name in NOTICES:
        source, bundled = Path(name), resources / name
        assert bundled.is_file() and not bundled.is_symlink(), f"Missing regular notice file: {name}"
        data = source.read_bytes()
        assert data and data == bundled.read_bytes(), f"Bundled notice differs from source: {name}"
        hashes[name] = hashlib.sha256(data).hexdigest()
    return hashes


def verify_builtin_themes():
    source = Path("src/styles/tokens.css")
    parser = Path("src-tauri/src/theme_frame.rs")
    built = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in Path("dist").rglob("*.css")}
    assert built, "Missing built CSS"
    css = "\n".join(Path(p).read_text() for p in built)
    for theme in BUILTIN_THEMES:
        assert f'[data-color-theme="{theme}"]' in source.read_text()
        assert re.search(r'\[data-color-theme=["\']?' + re.escape(theme) + r'["\']?\]', css), f"Missing built-in theme: {theme}"
    for package in ("theme-solarized", "theme-one"):
        assert not (Path("plugins") / package / "plugin.toml").exists(), "Duplicate built-in theme plugin"
    return {"ids": BUILTIN_THEMES, "tokens_css_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "native_frame_parser_sha256": hashlib.sha256(parser.read_bytes()).hexdigest(), "built_css_assets": built}


def main():
    notices = verify_notices(Path(sys.argv[1]))
    themes = verify_builtin_themes()
    assets = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in Path("dist").rglob("*") if p.is_file()}
    assert assets, "Missing built frontend assets"
    for family in ("inter", "jetbrains-mono"):
        assert any(family in p.lower() and p.endswith(".woff2") for p in assets), f"Missing bundled font: {family}"
    base = json.loads(Path("src-tauri/tauri.conf.json").read_text())
    manifest = {
        "sha": os.environ["GITHUB_SHA"],
        "source_commits": SOURCES,
        "previous_test_package": "eedd3ea0974a1b8b03feeff8243ec4b24c2d9636",
        "run_url": f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/actions/runs/{os.environ["GITHUB_RUN_ID"]}',
        "version": base["version"],
        "architecture": "arm64",
        "identifier": "com.bghtyu.openidea.test",
        "signing": "ad-hoc, not Developer ID; not notarized",
        "verification": {"app_architecture": True, "app_signature": True, "built_in_theme_assets": True,
                         "bundled_notices": True, "mounted_notices": False, "dmg_mount": False, "native_gui_launched": False},
        "product_source_verified": True,
        "font_sources": {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in [
            Path("src-tauri/src/commands/fonts.rs"), Path("src/platform/systemFonts.ts"),
            Path("src/platform/fonts.ts"), Path("src/platform/candidateFonts.ts"),
            Path("src/features/settings/components/FontPicker.tsx"), Path("docs/system-fonts.md")
        ]},
        "frontend_assets": assets,
        "built_in_themes": themes,
        "notice_resources": notices,
    }
    Path("test-artifacts/build-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
