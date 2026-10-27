import { afterEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { memo } from "react";
import type { ActiveIconTheme } from "@/bindings";
import { applyIconTheme, pathGlob, resolveThemeIcon, useIconThemeGeneration } from "./iconThemes";
import { Icon, fileIconName, folderIconName, hasIcon, iconMarkup, setFileIconOverride } from "./icons";

const svg =
  '<svg viewBox="0 0 16 16"><defs><clipPath id="clip"><path d="M0 0h16v16z"/></clipPath></defs><g clip-path="url(#clip)"><path fill="#ff0000" d="M0 0h8v8z"/></g></svg>';
function theme(pluginId = "one"): ActiveIconTheme {
  return {
    pluginId,
    theme: {
      id: "test",
      name: "Test",
      icons: {
        file: { light: svg, dark: svg.replace("#ff0000", "#00ff00") },
        json: { light: svg, dark: null },
        compound: { light: svg, dark: null },
        folder: { light: svg, dark: null },
        open: { light: svg, dark: null },
        path: { light: svg, dark: null },
      },
      rules: {
        file: "file",
        folder: { icon: "folder", expanded: "open" },
        fileNames: { "package.json": "json" },
        extensions: { json: "file", kts: "file", "gradle.kts": "compound", "test.gradle.kts": "json" },
        folderNames: { src: { icon: "folder", expanded: "open" } },
        folderRoles: {},
        paths: [{ pattern: ".github/workflows/*.yml", directory: false, icon: "path", expanded: null }],
      },
    },
  };
}
afterEach(() => {
  applyIconTheme(null);
  setFileIconOverride(null);
});
const key = (id: string, plugin = "one") => `icon-theme:${plugin}/test/${id}`;

describe("declarative icon resolver", () => {
  it("uses names, full paths, longest compound suffixes, directory state and fallbacks", () => {
    applyIconTheme(theme());
    expect(fileIconName("PACKAGE.JSON")).toBe(key("json"));
    expect(fileIconName("a.gradle.kts")).toBe(key("compound"));
    expect(fileIconName("a.test.gradle.kts")).toBe(key("json"));
    expect(fileIconName("a.kts")).toBe(key("file"));
    expect(fileIconName("mystery.blob")).toBe(key("file"));
    expect(fileIconName("constructor")).toBe(key("file"));
    expect(fileIconName("CI.YML", { path: ".GITHUB/workflows/CI.YML" })).toBe(key("path"));
    expect(fileIconName("CI.YML", { path: "/outside/.github/workflows/CI.YML" })).toBe(key("file"));
    expect(folderIconName("plain", { basename: "src", expanded: false })).toBe(key("folder"));
    expect(folderIconName("plain", { basename: "src", expanded: true })).toBe(key("open"));
    for (const role of ["module", "source", "test", "excluded", "github"] as const)
      expect(folderIconName(role, { basename: "src" })).not.toMatch(/^icon-theme:/);
  });
  it("keeps user associations first and supports themed sample lookup without recursion", () => {
    applyIconTheme(theme());
    setFileIconOverride((name) => (name === "custom" ? fileIconName("package.json") : null));
    expect(fileIconName("custom")).toBe(key("json"));
    setFileIconOverride(() => fileIconName("a.kts"));
    expect(fileIconName("package.json")).toBe(key("file"));
    setFileIconOverride(() => "file-python");
    expect(fileIconName("package.json")).toBe("file-python");
  });
  it("matches whole paths with bounded glob semantics and literal regex metacharacters", () => {
    expect(pathGlob("a/*.ts").test("A/b.ts")).toBe(true);
    expect(pathGlob("a/*.ts").test("a/b/c.ts")).toBe(false);
    expect(pathGlob("a/**.ts").test("a/b/c.ts")).toBe(true);
    expect(pathGlob("a/[b].ts").test("a/b.ts")).toBe(false);
    expect(pathGlob("a/[b].ts").test("a/[b].ts")).toBe(true);
    expect(pathGlob("*a".repeat(100) + "b").test("a".repeat(1000))).toBe(false);
  });
});

describe("dynamic SVG registry and lifecycle", () => {
  it("matches the host depth, UTF-8, attribute and selected-payload budgets atomically", () => {
    const single = (light: string): ActiveIconTheme => {
      const t = theme();
      t.theme.icons = { file: { light, dark: null } };
      return t;
    };
    const nested = (groups: number) => `<svg>${"<g>".repeat(groups)}${"</g>".repeat(groups)}</svg>`;
    applyIconTheme(single(nested(64)));
    expect(() => applyIconTheme(single(nested(65)))).toThrow();
    expect(() => applyIconTheme(single(`<svg>${"\u2003".repeat(22000)}</svg>`))).toThrow();
    expect(() => applyIconTheme(single(`<svg><path d="${"0".repeat(32769)}"/></svg>`))).toThrow();
    const names = [
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
      "clip-path",
      "gradientUnits",
      "gradientTransform",
      "offset",
      "stop-color",
      "stop-opacity",
    ];
    expect(() => applyIconTheme(single(`<svg ${names.map((name) => `${name}="0"`).join(" ")}/>`))).toThrow();
    const many = single("<svg/>");
    many.theme.icons = Object.fromEntries(
      Array.from({ length: 2049 }, (_, i) => [`i${i}`, { light: "<svg/>", dark: null }]),
    );
    expect(() => applyIconTheme(many)).toThrow();
    const large = `<svg><path d="${"0".repeat(32000)}" points="${"0".repeat(32000)}"/></svg>`;
    many.theme.icons = Object.fromEntries(
      Array.from({ length: 132 }, (_, i) => [`i${i}`, { light: large, dark: large }]),
    );
    expect(() => applyIconTheme(many)).toThrow();
    expect(hasIcon(key("file"))).toBe(true);
  });
  it("bounds rules and keeps Unicode lowercase literals case-insensitive", () => {
    const t = theme();
    t.theme.rules.fileNames = { "é.txt": "json" };
    t.theme.rules.extensions = { é: "compound" };
    t.theme.rules.folderNames = { données: { icon: "open", expanded: null } };
    applyIconTheme(t);
    expect(fileIconName("É.TXT")).toBe(key("json"));
    expect(fileIconName("a.É")).toBe(key("compound"));
    expect(folderIconName("plain", { basename: "DONNÉES" })).toBe(key("open"));
    for (const table of ["fileNames", "extensions", "folderNames"] as const) {
      const invalid = theme();
      Object.assign(invalid.theme.rules[table]!, {
        É: table === "folderNames" ? { icon: "file", expanded: null } : "file",
      });
      expect(() => applyIconTheme(invalid)).toThrow();
    }
    t.theme.rules.extensions = Object.fromEntries(Array.from({ length: 4097 }, (_, i) => [`ext${i}`, "file"]));
    expect(() => applyIconTheme(t)).toThrow();
    expect(() => pathGlob("é".repeat(129))).toThrow();
  });
  it("isolates fragment IDs in React, markup instances and light/dark variants", () => {
    applyIconTheme(theme());
    const { container } = render(
      <>
        <Icon name={key("file")} />
        <Icon name={key("file")} />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(4);
    const combined = iconMarkup(key("file"))! + iconMarkup(key("file"))!;
    const holder = document.createElement("div");
    holder.innerHTML = combined;
    const markupIds = [...holder.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(markupIds).size).toBe(4);
    expect(ids.some((id) => markupIds.includes(id))).toBe(false);
    for (const el of [...container.querySelectorAll("[clip-path]"), ...holder.querySelectorAll("[clip-path]")]) {
      const id = el.getAttribute("clip-path")!.slice(5, -1);
      expect([...ids, ...markupIds]).toContain(id);
    }
  });
  it("rerenders memoized consumers and clears assets when switched or removed", () => {
    const Row = memo(function Row() {
      useIconThemeGeneration();
      return <Icon name={fileIconName("package.json")} />;
    });
    const { container } = render(<Row />);
    expect(container.innerHTML).not.toContain("#ff0000");
    act(() => applyIconTheme(theme()));
    expect(container.innerHTML).toContain("#ff0000");
    act(() => applyIconTheme(theme("two")));
    expect(fileIconName("package.json")).toBe(key("json", "two"));
    expect(hasIcon(key("json"))).toBe(false);
    expect(iconMarkup(key("json"))).toBeNull();
    act(() => applyIconTheme(null));
    expect(fileIconName("package.json")).toBe("file-npm");
    expect(resolveThemeIcon({ basename: "x" })).toBeNull();
    expect(container.innerHTML).not.toContain("#ff0000");
  });
  it.each([
    "<svg><script/></svg>",
    "<svg onload='x'/>",
    "<svg><foreignObject/></svg>",
    "<svg><use href='#a'/></svg>",
    "<svg><path fill='url(https://evil)'/></svg>",
    "<svg><path fill='url(#missing)'/></svg>",
    "<svg><g id='a'/><g id='a'/></svg>",
    "<svg><path style='fill:red'/></svg>",
  ])("rejects untrusted IPC SVG: %s", (bad) => {
    const t = theme();
    t.theme.icons.file!.light = bad;
    expect(() => applyIconTheme(t)).toThrow();
    expect(hasIcon(key("file"))).toBe(false);
  });
});
