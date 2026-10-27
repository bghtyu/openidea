# Built-in theme sources

OpenIDEA includes Islands Light, Islands Dark, High Contrast, Solarized Light,
Solarized Dark, One Light and One Dark. Select them in Settings › Appearance,
Welcome › Customize or the existing quick theme menu. The same themes are
available as explicit editor schemes; “Theme default” follows the UI theme.
“Sync with OS” uses the existing preferred light/dark theme settings. Existing
ids (`light`, `dark`, `dark-hc`, `system`) and attribute overrides remain valid.

## Upstream palettes and licenses

All sources below are the original authors’ repositories, pinned for reproducibility.
Full MIT notices are preserved in [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).

| Theme                  | Original source revision                                                                                            | Palette / mapping source                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Solarized Light / Dark | [Ethan Schoonover, 62f656a](https://github.com/altercation/solarized/tree/62f656a02f93c5190a8753159e34b385588d5ff3) | README’s sixteen exact sRGB hex colours; `vim-colors-solarized/colors/solarized.vim` semantic roles; iTerm2 ANSI slots |
| One Light syntax       | [GitHub / Atom, d845790](https://github.com/atom/one-light-syntax/tree/d84579027410c576086dfca14d934c4bd74b0438)    | `styles/colors.less`, `styles/syntax-variables.less`                                                                   |
| One Dark syntax        | [GitHub / Atom, 9c96f44](https://github.com/atom/one-dark-syntax/tree/9c96f4454362267ac45322063e193ccf9d2debb1)     | `styles/colors.less`, `styles/syntax-variables.less`                                                                   |
| One Light UI           | [GitHub / Atom, a27bce3](https://github.com/atom/one-light-ui/tree/a27bce35088ecd323e44f5c2510bcf2d4e9efcf8)        | `styles/ui-variables.less`, `styles/ui-variables-custom.less`                                                          |
| One Dark UI            | [GitHub / Atom, 18c2143](https://github.com/atom/one-dark-ui/tree/18c2143d41e17b337fff6dc7024562c4d999be17)         | `styles/ui-variables.less`, `styles/ui-variables-custom.less`                                                          |

## Mapping into OpenIDEA

`src/platform/themes.ts` registers the stable ids. `data-theme` retains the
light/dark kind for icons, native controls and existing selectors;
`data-color-theme` selects the additional palette. High Contrast continues to
use `data-contrast="high"`. Plugin themes clear the built-in palette attribute
and retain their existing light/dark fallback; removing a plugin restores the
chosen built-in palette.

`src/styles/tokens.css` contains the shared mapping for all colour tokens and
four palette blocks. No new dependency is required. Solarized uses base3/base2
for light backgrounds and base03/base02 for dark backgrounds, base00/base0 for
text, and the original eight accents. Vim’s statements are green, constants
and strings cyan, identifiers blue, types yellow, and comments the original
subdued base1/base01. Solarized’s original ANSI slot order is preserved (the
bright slots intentionally include orange, violet and neutrals).

One retains the exact HSL definitions from Atom, avoiding rounded palette
approximations: 230° / 1% / 98% light and 220° / 13% / 18% dark editor backgrounds;
purple keywords, green strings, blue functions, red variables/tags, orange
numbers and attributes, yellow classes, and the original mono-3 comments.
UI frame/popup levels use Atom’s relative background lightness formulas with
the matching syntax theme. OpenIDEA’s shared UI text uses the syntax foreground
and mono-2 for readable secondary labels. Selection and cursor-line values
follow Atom’s syntax variables. Atom does not define a terminal ANSI palette:
One’s ANSI slots reuse its exact semantic syntax hues, repeating them for bright
colours rather than inventing a different palette. One Light maps ANSI white
and bright white to its mono-2 and mono-1 text colours so they remain visible
on the light terminal background.

Components without an upstream equivalent (feedback banners, tool window states,
search fills and focus decoration) use the original semantic hues, neutrals,
or explicit `color-mix()` tints. This adapts colours to the existing layout;
it does not recreate Atom’s or Vim’s UI. Platform traffic-light colours stay
platform colours. Original subdued comments and some syntax accents have lower
contrast than a high-contrast accessibility theme; High Contrast remains available.

`src-tauri/src/windows.rs` mirrors all frame colours for native window startup.
The frontend resolves HSL and mixed frame tokens to RGB tuples before invoking
Tauri’s native window API (which accepts hex strings or tuples, not CSS HSL).
Native Settings startup uses the same conversion, serialized as hex for its
existing string IPC contract, including before the child webview loads.

The cache in `public/boot.js` restores the palette before application startup;
`public/splash.css` mirrors the frame backgrounds before tokens load. The
backend’s existing settings persistence remains authoritative. Terminal and
editor observers also watch palette changes within the same light/dark kind.
Custom accents, explicit editor schemes, per-scheme attribute overrides,
compact mode and accessibility options retain their precedence.

## Browser evidence

These approved screenshots are reused from the original theme implementation on
0.1.15; regression checks are rerun against the upstream contribution base.
Captured at 1400 × 900 in Linux Chromium 154 using OpenIDEA's public in-memory
`acme-api` project / Kotlin fixture and synthetic ANSI terminal output. The
terminal is a real xterm renderer, without a native PTY or shell. These images
cover the shell, sidebar, editor, gutter, find matches, terminal, Settings,
focused controls, disabled settings and the selected theme popup.

| Theme | Workbench, editor and terminal | Settings and theme popup |
|---|---|---|
| Solarized Light | [Screenshot](media/themes/solarized-light-workbench.png) | [Screenshot](media/themes/solarized-light-popup.png) |
| Solarized Dark | [Screenshot](media/themes/solarized-dark-workbench.png) | [Screenshot](media/themes/solarized-dark-popup.png) |
| One Light | [Screenshot](media/themes/one-light-workbench.png) | [Screenshot](media/themes/one-light-popup.png) |
| One Dark | [Screenshot](media/themes/one-dark-workbench.png) | [Screenshot](media/themes/one-dark-popup.png) |

The browser regression also checks refresh / startup cache restoration,
selection visibility, same-kind switches, the quick menu, existing themes,
explicit editor schemes and preferred OS themes. Native startup colours are
covered separately by Rust unit tests; browser checks of the RGB tuples do
not replace native GUI acceptance. Native GUI, actual PTY rendering, OS theme
events in a desktop webview, and macOS/Windows visual acceptance have not been
run in this task.
