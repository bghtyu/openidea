import { beforeEach, describe, expect, it, vi } from "vitest";
const { native, discover } = vi.hoisted(() => ({ native: vi.fn(() => true), discover: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: native }));
vi.mock("@/bindings", () => ({ commands: { systemFonts: discover } }));
import { bundledFonts, loadSystemFonts, useSystemFontStore } from "./systemFonts";

beforeEach(() => {
  native.mockReturnValue(true);
  discover.mockReset();
  useSystemFontStore.setState({ fonts: bundledFonts, status: "idle" });
});
describe("local font discovery", () => {
  it("shares an in-flight request, caches families outside the old list and explicitly refreshes", async () => {
    let resolve!: (fonts: unknown) => void;
    discover.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const first = loadSystemFonts();
    expect(useSystemFontStore.getState().status).toBe("loading");
    expect(loadSystemFonts()).toBe(first);
    resolve({
      status: "ok",
      data: [
        { name: "Maple Mono NF", monospace: true },
        { name: "maple mono nf", monospace: true },
      ],
    });
    await first;
    expect(useSystemFontStore.getState().fonts.map((f) => f.name)).toEqual([
      "Inter",
      "JetBrains Mono",
      "maple mono nf",
    ]);
    await loadSystemFonts();
    expect(discover).toHaveBeenCalledTimes(1);
    discover.mockResolvedValue({ status: "ok", data: [] });
    await loadSystemFonts(true);
    expect(discover).toHaveBeenLastCalledWith(true);
    expect(useSystemFontStore.getState().fonts).toEqual([bundledFonts[1], bundledFonts[0]]);
  });
  it("reports errors without losing suggestions, then retries", async () => {
    discover.mockResolvedValueOnce({ status: "error", error: { kind: "unavailable", message: "Unavailable" } });
    await loadSystemFonts();
    expect(useSystemFontStore.getState()).toMatchObject({ status: "error", fonts: bundledFonts });
    discover.mockResolvedValue({ status: "ok", data: [{ name: "思源宋体", monospace: false }] });
    await loadSystemFonts(true);
    expect(useSystemFontStore.getState().status).toBe("ready");
    expect(useSystemFontStore.getState().fonts.some((f) => f.name === "思源宋体")).toBe(true);
  });
  it("does not invoke desktop APIs in browser development", async () => {
    native.mockReturnValue(false);
    await loadSystemFonts();
    expect(discover).not.toHaveBeenCalled();
    expect(useSystemFontStore.getState().status).toBe("browser");
  });
});
