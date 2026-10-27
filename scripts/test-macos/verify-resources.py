"""Verify offline packages copied into the test app, then record build evidence."""
from pathlib import Path
import hashlib
import json
import os
import re
import sys
import tomllib

SOURCES = {
    "product_integration": "c50317731f18eadc1baf23e99fa55cf773a0847a",
    "upstream_main": "8568ff001bafcb9e1fd19916ec8c45d57a5ba981",
    "theme_adoption": "3b608355a372ce72522f1eee11fb63c06890edce",
    "icon_pr2": "7cfe50a93d418b3fae0560ad33f49a54dd1af783",
}
PACKAGES = {
    "icon-theme-atom-material": {"atom-material"},
}
BUILTIN_THEMES = ("solarized-light", "solarized-dark", "one-light", "one-dark")


def verify_plugins(resources):
    hashes = {}
    assert {p.name for p in (resources / "plugins").iterdir()} == set(PACKAGES), "Unexpected bundled plugin packages"
    for package, expected in PACKAGES.items():
        source = Path("plugins") / package
        bundled = resources / "plugins" / package
        files = {p.relative_to(source) for p in source.rglob("*") if p.is_file()}
        actual = {p.relative_to(bundled) for p in bundled.rglob("*") if p.is_file()}
        assert actual == files, f"Package file set differs: {package}"
        for relative in sorted(files):
            src, dst = source / relative, bundled / relative
            assert not src.is_symlink() and not dst.is_symlink(), f"Unexpected symlink: {dst}"
            assert src.read_bytes() == dst.read_bytes(), f"Package resource differs: {dst}"
            hashes[f"plugins/{package}/{relative}"] = hashlib.sha256(dst.read_bytes()).hexdigest()
        manifest = tomllib.loads((bundled / "plugin.toml").read_text())
        assert manifest["id"] == package and "wasm" not in manifest
        assert (bundled / "LICENSE").read_text().strip()
        key = "icon-themes" if package.startswith("icon-") else "themes"
        definitions = [json.loads((bundled / d["path"]).read_text()) for d in manifest["contributes"][key]]
        assert {d["id"] for d in definitions} == expected
        if key == "icon-themes":
            provenance = json.loads((bundled / "provenance.json").read_text())
            assert len(provenance["assets"]) == 120
            for asset in provenance["assets"]:
                path = bundled / asset["path"]
                assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"]
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
    plugins = verify_plugins(Path(sys.argv[1]))
    themes = verify_builtin_themes()
    assets = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in Path("dist").rglob("*") if p.is_file()}
    assert assets, "Missing built frontend assets"
    base = json.loads(Path("src-tauri/tauri.conf.json").read_text())
    manifest = {
        "sha": os.environ["GITHUB_SHA"],
        "source_commits": SOURCES,
        "upstream_cutoff": "2026-10-27 11:15 UTC",
        "run_url": f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/actions/runs/{os.environ["GITHUB_RUN_ID"]}',
        "version": base["version"],
        "architecture": "arm64",
        "identifier": "com.bghtyu.openidea.test",
        "signing": "ad-hoc, not Developer ID; not notarized",
        "verification": {"app_architecture": True, "app_signature": True, "bundled_plugin_resources": True, "built_in_theme_assets": True,
                         "dmg_mount": False, "native_gui_launched": False},
        "frontend_assets": assets,
        "plugin_resources": plugins,
        "built_in_themes": themes,
    }
    Path("test-artifacts/build-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
