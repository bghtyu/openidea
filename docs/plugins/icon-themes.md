# Icon themes

Icon themes are contribution-only plugin packages. They need no WASM, project
read/write permission, network access, DOM access, or CSS injection. Install one
from Settings → Plugins → Available or Install from Disk, then explicitly choose
**Apply Icons** in its details. **Use Default Icons** restores the host set.
The selection is persisted independently of the color theme, including Solarized,
One and Islands. Disabling an owner withdraws its icons; enabling it restores the
explicit selection. Uninstall clears that selection. Reload replaces all assets.
Project dev packages can be inspected but must be installed before selection;
opening a project never selects its icons.

```toml
[[contributes.icon-themes]]
path = "icons.json"
```

All resources below are relative to the **package root**, including license
notices. Installation copies the mapping, both SVG variants and every notice;
missing, unsafe or unresolved resources reject installation before replacing an
existing package. IDs are local to the package/theme; the frontend registry uses
`icon-theme:<plugin>/<theme>/<icon>`. There is no per-row IPC or WASM callback.

```json
{
  "id": "sample",
  "name": "Sample Icons",
  "notices": ["LICENSE", "NOTICE"],
  "icons": {
    "file": {"light": "icons/file.svg", "dark": "icons/file-dark.svg"},
    "folder": {"light": "icons/folder.svg"},
    "open": {"light": "icons/open.svg"}
  },
  "rules": {
    "file": "file",
    "folder": {"icon": "folder", "expanded": "open"},
    "fileNames": {"package.json": "file"},
    "extensions": {"gradle.kts": "file", "kts": "file"},
    "folderNames": {"src": {"icon": "folder", "expanded": "open"}},
    "folderRoles": {"source": {"icon": "folder", "expanded": "open"}},
    "paths": [{"pattern": ".github/workflows/*.yml", "directory": false, "icon": "file"}]
  }
}
```

Rules match case-insensitively. Table keys must be lowercase literals. File
resolution is: user associations/explicit file type override, ordered matching
path rule, exact basename, longest compound extension, package default. Path
rules match the **whole normalized project-relative path**: `*` excludes `/`,
`**` includes it, `?` consumes one non-slash character, and everything else is
literal. Matching uses a bounded bitset state machine, not arbitrary regular
expressions. Absolute paths do not match path rules. Files outside the project
still use basename and extension mappings.

For directories, semantic roles have priority over path/name/default rules.
Supported roles are `module`, `source`, `test`, `resources`, `testResources`,
`excluded`, `library`, and `github`. An unmapped role keeps the host glyph rather
than losing that meaning. `expanded` falls back to `icon` when absent. Existing
VCS/error/excluded decorations remain host-owned. Explicit contributed node icons
are preserved. Toolbars, PSI nodes and global UI replacement are outside this API.

The host and browser renderer both validate SVG. The supported dialect contains
`svg`, groups, paths and geometric shapes, defs, clip paths and gradients, with
allowlisted attributes. No script, event handlers, CSS/style, foreignObject,
image, href/use, animations, DTD/entities, network URLs or nonlocal references.
Only `url(#id)` paint/clip references to unique existing IDs are accepted, and IDs
are isolated per instance and light/dark variant in both React `Icon` and
`iconMarkup`. Every resource must be a regular UTF-8 file within the canonical
package root, including through symlinks. Limits: 64 KiB per resource, 16 MiB per
package, 16 themes, 2048 icons per theme, 4096 table rules and SVG elements, 64 path rules, SVG depth 64.
Color themes retain their separate prohibition on CSS URLs.

## Atom Material Style package and provenance

`plugins/icon-theme-atom-material` is independently installable and never selected
by default. Its flat document initials and open/closed folder geometry are
original MIT-licensed artwork by Walter Wang. They are style-compatible
replacements, not Atom Material's logos or full visual catalog. `LICENSE`,
`NOTICE` and `provenance.json` travel with the installed package. The provenance
lists every asset's SHA-256, author and license.

Reference revisions are pinned to a-file-icon-idea
`0f0a41f20856c83da505bee9da0e12e4ac5bfac1` and iconGenerator
`3efb7279176465d18e048d6eed8b916e9c7acd89`. The MIT-licensed XML association
reference is captured in `scripts/icons/upstream-associations.json`. `scripts/icons/translation-plan.json` records the reviewed subset conversion;
the generator verifies its source patterns and representative full-string matches. Selected
rules were deliberately translated into literal names/extensions and simple
whole-path globs, not copied as Java regex: Java uses ignore-case whole-string
matches, path-aware when `/` occurs. Examples: NPM's `^package\.json$` becomes
`fileNames["package.json"]`; Gradle KTS's `.*\.gradle\.kts$` becomes extension
`gradle.kts`; test/spec suffix alternatives become individual compound extensions;
GitHub's YAML path regex becomes two explicit `.github/workflows/*.yml`/`*.yaml`
globs. The GitHub conversion intentionally covers workflows only. Native file
type/PSI mappings and disabled-by-default exotic folder regexes are not imported.
The package's additional common extensions and roles are host-specific mappings.

**License gap:** all 3026 upstream SVGs are excluded. The upstream MIT headers and
credits alone do not establish the licenses of individual File-Icons, MFixx,
Devicons, Octicons, Material Design, FontAwesome or Noun Project glyphs. No paid or
unverified artwork is included. This first package covers common development
files and directory roles; the wider upstream logo/format catalog remains a gap.

Reproduce offline (Python standard library only):

```sh
python3 scripts/icons/build_atom_material.py
python3 scripts/icons/build_atom_material.py --check
# Optional verification against an existing checkout at both fixed revisions:
python3 scripts/icons/build_atom_material.py --check --reference /path/to/a-file-icon-idea
```

Browser development simulates installation using this package's source assets.
That simulation does not execute Rust filesystem checks, persist real packages,
or prove desktop IPC behavior. Rust host lifecycle/security tests exercise native
installation and validation with temporary packages, without a release or DMG.
