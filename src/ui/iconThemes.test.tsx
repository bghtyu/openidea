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
