import { expect, openFromTree, test } from "./fixtures";

test.setTimeout(60_000);

test("browser simulation: install/select icons, tree/tab refresh, variants and uninstall", async ({
  workbench: page,
}, info) => {
  await openFromTree(page, "build.gradle.kts");
  const tree = page.getByRole("tree", { name: "Project" });
  const file = tree.getByRole("treeitem", { name: "build.gradle.kts", exact: true });
  const before = await file.locator("svg").last().innerHTML();
  await page.keyboard.press("Meta+,");
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("textbox", { name: "Search settings" }).fill("Plugins");
  await settings.getByRole("treeitem", { name: "Plugins", exact: true }).click();
  await settings.getByRole("tab", { name: "Available", exact: true }).click();
  await settings.getByRole("button", { name: "Install Atom Material Style Icons", exact: true }).first().click();
  await settings.getByRole("tab", { name: /^Installed/ }).click();
  await settings
    .getByRole("button", { name: /^Atom Material Style Icons/ })
    .first()
    .click();
  await expect(settings.getByText("File and folder icons. Works with any color theme.")).toBeVisible();
  await expect(file.locator("svg").last()).toHaveJSProperty("innerHTML", before);
  await settings.getByRole("button", { name: "Apply icon theme Atom Material Style", exact: true }).click();
  await expect(settings.getByRole("button", { name: "Use Default Icons", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(file.locator("svg svg")).toHaveCount(2);
  const tab = page.getByRole("tablist", { name: "Editor tabs" }).getByRole("tab", { name: "build.gradle.kts" });
  await expect(tab.locator("svg svg")).toHaveCount(2);
  const src = tree.getByRole("treeitem", { name: "src", exact: true });
  const closed = await src.locator("svg svg").first().innerHTML();
  await src.click();
  await page.keyboard.press("ArrowRight");
  await expect(src).toHaveAttribute("aria-expanded", "true");
  expect(await src.locator("svg svg").first().innerHTML()).not.toBe(closed);
  await page.screenshot({ path: info.outputPath("material-folders-and-tabs.png"), animations: "disabled" });
  for (const label of ["Solarized Light", "Solarized Dark"]) {
    await page.keyboard.press("Meta+,");
    await settings.getByRole("textbox", { name: "Search settings" }).fill("Plugins");
    await settings.getByRole("treeitem", { name: "Plugins", exact: true }).click();
    await settings
      .getByRole("button", { name: /^Solarized Themes/ })
      .first()
      .click();
    await settings.getByRole("button", { name: `Apply theme ${label}`, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(tab.locator("svg svg")).toHaveCount(2);
    const visibleVariants = await tab.locator("svg svg").evaluateAll(
      (els) =>
        els.filter((el) => {
          const parent = el.parentElement!;
          return getComputedStyle(parent).display !== "none";
        }).length,
    );
    expect(visibleVariants).toBe(1);
  }
  // Existing association priority and memoized rows are tested without desktop file APIs.
  await page.evaluate(async () => {
    const path = "/src/ui/icons.tsx";
    const { setFileIconOverride } = await import(/* @vite-ignore */ path);
    setFileIconOverride((name: string) => (name === "build.gradle.kts" ? "file-python" : null));
  });
  await expect(file.locator("svg svg")).toHaveCount(0);
  await expect(tab.locator("svg svg")).toHaveCount(0);
  await page.evaluate(async () => {
    const path = "/src/ui/icons.tsx";
    (await import(/* @vite-ignore */ path)).setFileIconOverride(null);
  });
  await expect(file.locator("svg svg")).toHaveCount(2);
  await page.keyboard.press("Meta+,");
  await settings.getByRole("textbox", { name: "Search settings" }).fill("Plugins");
  await settings.getByRole("treeitem", { name: "Plugins", exact: true }).click();
  await settings
    .getByRole("button", { name: /^Atom Material Style Icons/ })
    .first()
    .click();
  const disable = settings.getByRole("checkbox", { name: "Disable Atom Material Style Icons", exact: true });
  await disable.uncheck();
  await expect(file.locator("svg svg")).toHaveCount(0);
  await settings.getByRole("checkbox", { name: "Enable Atom Material Style Icons", exact: true }).check();
  await expect(file.locator("svg svg")).toHaveCount(2);
  await settings.getByRole("button", { name: "Use Default Icons", exact: true }).click();
  await expect(file.locator("svg svg")).toHaveCount(0);
  await settings.getByRole("button", { name: "Apply icon theme Atom Material Style", exact: true }).click();
  await settings.getByRole("button", { name: "Uninstall…", exact: true }).click();
  await settings.getByRole("button", { name: "Confirm uninstall Atom Material Style Icons", exact: true }).click();
  await expect(file.locator("svg svg")).toHaveCount(0);
  await expect(tab.locator("svg svg")).toHaveCount(0);
});
