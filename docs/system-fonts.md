# Desktop font selection

Settings discovers families from the **local desktop**, including when the project
runs over SSH. The Tauri-only `system_fonts` command is not exposed by ide-host;
the frontend routing guard keeps it local even if a remote server advertises it.
No font bytes or file paths cross IPC or get uploaded.

`font-kit` 0.14 uses CoreText on macOS, DirectWrite on Windows and Fontconfig /
FreeType on Linux. These native sources fit Tauri's WebKit-based platforms;
Chromium's `queryLocalFonts` is not required. Linux builds use Fontconfig and
FreeType development libraries (already transitively supplied by GTK/WebKit).

Discovery runs on a blocking worker, serializes concurrent scans and caches the
result in the desktop process. Windows explicitly checks DirectWrite for updates
before constructing font-kit's cached collection. Refresh creates a new native source and replaces
the cache only after success. A shared frontend store coalesces requests within
each window. Each settings window can explicitly refresh its suggestions.
Browser development offers bundled fonts and manual entry without attempting
native APIs or pretending to enumerate the operating system.

Families are native family names, not full/PostScript face names: weights,
italics and variable instances do not become separate choices. Case-insensitive
deduplication keeps the native Unicode spelling. Monospace metadata agrees
across readable faces; mixed or unreadable faces have unknown spacing. This is
only a browsing aid, not a glyph-coverage guarantee. Disable the editor's
monospace filter to see proportional and unknown families. Fallback selectors
always offer all families, including proportional CJK fonts.

The editable picker stages values through the existing settings model. It does
not replace missing saved preferences or alter global/project scopes, standalone
settings-window synchronization, UI opt-in, or terminal inheritance. A missing
name is reported only after successful native enumeration; a failed refresh
keeps previous suggestions. JetBrains Mono remains available through its bundled
Variable face, and Inter resolves to Inter Variable in every primary/fallback/UI
selection. Terminal font loading and cell fitting remain unchanged.

The interaction follows the family-service approach of IntelliJ's
[FontFamilyCombo](https://github.com/JetBrains/intellij-community/blob/74dbd42b7a8787b0707437cb857c68e78199f611/platform/platform-impl/src/com/intellij/application/options/editor/fonts/FontFamilyCombo.java),
without using a known-font list as an availability whitelist.
