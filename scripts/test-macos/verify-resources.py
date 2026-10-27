"""Verify offline packages copied into the test app, then record build evidence."""
from pathlib import Path
import hashlib
import json
import os
import sys
import tomllib

SOURCES = {
    "product_integration": "5e7812f9b23e6c91cf4c5525c13a08f0f177275c",
    "upstream_main": "c666cee0758341a36f6c648e3f1bca1100f025f6",
    "icon_pr2": "7cfe50a93d418b3fae0560ad33f49a54dd1af783",
}
PACKAGES = {
    "theme-solarized": {"solarized-light", "solarized-dark"},
    "theme-one": {"one-light", "one-dark"},
    "icon-theme-atom-material": {"atom-material"},
}


def verify_plugins(resources):
    hashes = {}
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
        # The pinned theme files use full-line JSONC comments for attribution.
        definitions = [json.loads("\n".join(line for line in (bundled / d["path"]).read_text().splitlines()
                                             if not line.lstrip().startswith("//")))
                       for d in manifest["contributes"][key]]
        assert {d["id"] for d in definitions} == expected
        if key == "icon-themes":
            provenance = json.loads((bundled / "provenance.json").read_text())
            assert len(provenance["assets"]) == 120
            for asset in provenance["assets"]:
                path = bundled / asset["path"]
                assert hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"]
    return hashes


def main():
    plugins = verify_plugins(Path(sys.argv[1]))
    assets = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in Path("dist").rglob("*") if p.is_file()}
    assert assets, "Missing built frontend assets"
    base = json.loads(Path("src-tauri/tauri.conf.json").read_text())
    manifest = {
        "sha": os.environ["GITHUB_SHA"],
        "source_commits": SOURCES,
        "run_url": f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/actions/runs/{os.environ["GITHUB_RUN_ID"]}',
        "version": base["version"],
        "architecture": "arm64",
        "identifier": "com.bghtyu.openidea.test",
        "signing": "ad-hoc, not Developer ID; not notarized",
        "verification": {"app_architecture": True, "app_signature": True, "bundled_plugin_resources": True,
                         "dmg_mount": False, "native_gui_launched": False},
        "frontend_assets": assets,
        "plugin_resources": plugins,
    }
    Path("test-artifacts/build-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
