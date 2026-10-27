/** The active package is loaded once; render paths only query this in-memory registry. */
import { useSyncExternalStore } from "react";
import type { ActiveIconTheme, FolderIcons, IconSvg, IconRules, IconPathRule } from "@/bindings";
import styles from "./icons.module.css";

export interface IconContext {
  basename: string;
  /** Normalized project-relative path. Absolute paths do not match path rules. */
  path?: string;
  isDirectory?: boolean;
  expanded?: boolean;
  folderRole?: string;
}
export type ThemeIconName = `icon-theme:${string}`;
export interface PreparedThemeIcon {
  viewBox: string;
  html: string;
  hasIds: boolean;
  mono: boolean;
}
const listeners = new Set<() => void>();
let generation = 0;
let active: {
  rules: IconRules;
  prefix: string;
  paths: { re: { test(path: string): boolean }; rule: IconPathRule }[];
} | null = null;
const icons = new Map<string, PreparedThemeIcon>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const iconThemeGeneration = () => generation;
export const useIconThemeGeneration = () => useSyncExternalStore(subscribe, iconThemeGeneration, iconThemeGeneration);
export function invalidateFileIcons() {
  generation++;
  listeners.forEach((f) => f());
}
export const themeIcon = (name: string) => icons.get(name);

const tags = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "clipPath",
  "linearGradient",
  "radialGradient",
  "stop",
]);
const attrs = new Set([
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "fill-rule",
  "clip-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "transform",
  "id",
  "clip-path",
  "gradientUnits",
  "gradientTransform",
  "offset",
  "stop-color",
  "stop-opacity",
  "fx",
  "fy",
  "spreadMethod",
]);
const ident = /^[a-zA-Z0-9_-]{1,64}$/;
// Match the host's resource limits; only the selected theme crosses IPC.
const MAX_FILE = 64 * 1024;
const MAX_PACKAGE = 16 * 1024 * 1024;
const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;

/** Defense in depth for IPC and the browser simulation. Never use the trusted built-in SVG parser. */
function prepareSvg(src: string, variant: string): { viewBox: string; html: string } {
  if (src.length > MAX_FILE || byteLength(src) > MAX_FILE || /<!|<\?/.test(src))
    throw new Error("Unsupported icon SVG content");
  const doc = new DOMParser().parseFromString(src, "image/svg+xml");
  const root = doc.documentElement;
  if (root.tagName !== "svg" || doc.querySelector("parsererror")) throw new Error("Malformed icon SVG");
  const nodes = [root, ...root.querySelectorAll("*")];
  if (nodes.length > 4096) throw new Error("Icon SVG too complex");
  const ids = new Set<string>();
  const refs: string[] = [];
  const depths = new Map<Element, number>();
  for (const el of nodes) {
    const depth = el === root ? 1 : depths.get(el.parentElement!)! + 1;
    if (depth > 65 || el.attributes.length > 32) throw new Error("Icon SVG too complex");
    depths.set(el, depth);
    if (!tags.has(el.tagName) || (el !== root && el.tagName === "svg")) throw new Error("Unsupported icon element");
    for (const node of el.childNodes)
      if (node.nodeType !== 1 && !(node.nodeType === 3 && !node.textContent?.trim()))
        throw new Error("Unsupported icon content");
    for (const attr of [...el.attributes]) {
      const { name, value } = attr;
      if (name === "xmlns" && el === root && value === "http://www.w3.org/2000/svg") continue;
      if (!attrs.has(name) || byteLength(value) > 32768 || /[<>&\\:;'"\0]/.test(value))
        throw new Error("Unsafe icon attribute");
      if (name === "id") {
        if (!ident.test(value) || ids.has(value)) throw new Error("Duplicate or invalid icon ID");
        ids.add(value);
      } else if (["fill", "stroke", "clip-path"].includes(name) && /^url\(#[a-zA-Z0-9_-]{1,64}\)$/.test(value)) {
        refs.push(value.slice(5, -1));
      } else if (!/^[a-zA-Z0-9 #.,()%+\-\t\r\n]*$/.test(value) || /url/i.test(value))
        throw new Error("Unsafe icon value");
    }
  }
  if (refs.some((id) => !ids.has(id))) throw new Error("Missing icon fragment");
  const viewBox = root.getAttribute("viewBox") ?? "0 0 16 16";
  const box = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v) || Math.abs(v) > 100000) || box[2]! <= 0 || box[3]! <= 0)
    throw new Error("Invalid icon viewBox");
  for (const el of nodes)
    for (const attr of [...el.attributes]) {
      if (attr.name === "id") attr.value = `__ID__${variant}${attr.value}`;
      else attr.value = attr.value.replace(/url\(#([a-zA-Z0-9_-]+)\)/g, `url(#__ID__${variant}$1)`);
    }
  // Retain presentation attributes on the original root. The nested SVG takes the host size.
  root.removeAttribute("width");
  root.removeAttribute("height");
  return { viewBox, html: new XMLSerializer().serializeToString(root) };
}
function prepareAsset(asset: IconSvg): PreparedThemeIcon {
  const light = prepareSvg(asset.light, "l");
  const dark = asset.dark != null ? prepareSvg(asset.dark, "d") : null;
  const html = dark
    ? `<g class="${styles.light}">${light.html}</g><g class="${styles.dark}">${dark.html}</g>`
    : light.html;
  return { viewBox: light.viewBox, html, hasIds: html.includes("__ID__"), mono: false };
}

/** Glob syntax is deliberately smaller than Java regex; the complete relative path must match. */
export function pathGlob(pattern: string): { test(path: string): boolean } {
  // A bounded bitset NFA avoids regex backtracking and repeated per-character arrays.
  if (!pattern || byteLength(pattern) > 256) throw new Error("Invalid icon path glob");
  const tokens: string[] = [];
  for (const c of pattern.toLowerCase()) {
    if (c === "*" && (tokens.at(-1) === "*" || tokens.at(-1) === "**")) tokens[tokens.length - 1] = "**";
    else tokens.push(c);
  }
  const literals = new Map<string, bigint>();
  let stars = 0n,
    globstars = 0n,
    questions = 0n;
  tokens.forEach((token, i) => {
    const bit = 1n << BigInt(i);
    if (token === "*") stars |= bit;
    else if (token === "**") globstars |= bit;
    else if (token === "?") questions |= bit;
    else literals.set(token, (literals.get(token) ?? 0n) | bit);
  });
  const allStars = stars | globstars;
  const closure = (s: bigint) => s | ((s & allStars) << 1n);
  const accept = 1n << BigInt(tokens.length);
  return {
    test(input) {
      if (input.length > 8192) return false;
      let state = closure(1n);
      for (const c of input.toLowerCase()) {
        const nonSlash = c !== "/";
        state = closure(
          ((state & ((literals.get(c) ?? 0n) | (nonSlash ? questions : 0n))) << 1n) |
            (state & (globstars | (nonSlash ? stars : 0n))),
        );
        if (!state) return false;
      }
      return (state & accept) !== 0n;
    },
  };
}

/** Atomic replacement also drops every cached asset on reload, disable and uninstall. */
let appliedSignature = "null";
export function applyIconTheme(theme: ActiveIconTheme | null) {
  if (theme) {
    const assets = Object.values(theme.theme.icons);
    if (!assets.length || assets.length > 2048) throw new Error("Too many or missing icon assets");
    let bytes = 0;
    for (const asset of assets) {
      for (const source of [asset!.light, asset!.dark]) {
        if (source == null) continue;
        if (source.length > MAX_FILE || byteLength(source) > MAX_FILE) throw new Error("Icon SVG too large");
        bytes += byteLength(source);
        if (bytes > MAX_PACKAGE) throw new Error("Icon theme exceeds size limit");
      }
    }
    const rules = theme.theme.rules;
    let count = (rules.paths ?? []).length;
    for (const table of [rules.fileNames, rules.extensions, rules.folderNames]) {
      const keys = Object.keys(table ?? {});
      count += keys.length;
      if (count > 4096) throw new Error("Too many icon rules");
      for (const key of keys)
        if (!key || byteLength(key) > 256 || key !== key.toLowerCase() || /[/\\*?]/.test(key))
          throw new Error("Invalid lowercase icon rule key");
    }
    for (const path of rules.paths ?? [])
      if (
        path.pattern.startsWith("/") ||
        /[\\:\0]/.test(path.pattern) ||
        path.pattern.split("/").some((s) => s === "." || s === "..")
      )
        throw new Error("Invalid project-relative icon path glob");
  }
  const signature = JSON.stringify(theme);
  if (signature === appliedSignature) return;
  const next = new Map<string, PreparedThemeIcon>();
  let selection: typeof active = null;
  if (theme) {
    if ((theme.theme.rules.paths ?? []).length > 64) throw new Error("Too many icon path rules");
    const prefix = `icon-theme:${theme.pluginId}/${theme.theme.id}/`;
    for (const [id, asset] of Object.entries(theme.theme.icons)) next.set(prefix + id, prepareAsset(asset!));
    selection = {
      prefix,
      rules: theme.theme.rules,
      paths: (theme.theme.rules.paths ?? []).map((rule) => ({ rule, re: pathGlob(rule.pattern) })),
    };
  }
  icons.clear();
  next.forEach((value, key) => icons.set(key, value));
  active = selection;
  appliedSignature = signature;
  invalidateFileIcons();
}

const lookup = <T>(table: Record<string, T> | undefined, key: string): T | undefined =>
  table && Object.hasOwn(table, key) ? table[key] : undefined;

export function resolveThemeIcon(ctx: IconContext): ThemeIconName | null {
  if (!active) return null;
  const { rules, prefix } = active;
  const name = ctx.basename.toLowerCase();
  const choose = (p: FolderIcons) => (ctx.expanded ? (p.expanded ?? p.icon) : p.icon);
  let id: string | undefined;
  if (ctx.isDirectory && ctx.folderRole && ctx.folderRole !== "plain") {
    const role = lookup(rules.folderRoles, ctx.folderRole);
    // An unmapped semantic role keeps the host glyph (module/source/test/excluded/VCS).
    if (!role) return null;
    id = choose(role);
  } else {
    const path = ctx.path?.replace(/\\/g, "/");
    const rule =
      path && !path.startsWith("/") && !path.includes(":")
        ? active.paths.find((p) => !!p.rule.directory === !!ctx.isDirectory && p.re.test(path))?.rule
        : undefined;
    if (rule) id = ctx.expanded ? (rule.expanded ?? rule.icon) : rule.icon;
    else if (ctx.isDirectory) id = choose(lookup(rules.folderNames, name) ?? rules.folder);
    else {
      id = lookup(rules.fileNames, name);
      if (!id) {
        // Every suffix in order, longest compound extension first.
        for (let dot = name.indexOf("."); dot >= 0; dot = name.indexOf(".", dot + 1)) {
          id = lookup(rules.extensions, name.slice(dot + 1));
          if (id) break;
        }
      }
      id ??= rules.file;
    }
  }
  const key = prefix + id;
  return icons.has(key) ? (key as ThemeIconName) : null;
}
