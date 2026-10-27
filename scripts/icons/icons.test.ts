// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../plugins/icon-theme-atom-material/", import.meta.url));
const json = (name: string) => JSON.parse(readFileSync(root + name, "utf8"));

describe("reviewed Material package", () => {
  it("accounts for every shipped SVG with exact content, author and license", () => {
    const provenance = json("provenance.json");
    expect(provenance.upstream.commit).toBe("0f0a41f20856c83da505bee9da0e12e4ac5bfac1");
    expect(provenance.upstream.generatorCommit).toBe("3efb7279176465d18e048d6eed8b916e9c7acd89");
    expect(provenance.artwork.borrowedSvgCount).toBe(0);
    const paths = provenance.assets.map((a: { path: string }) => a.path).sort();
    expect(paths).toEqual(
      readdirSync(root + "icons")
        .map((p) => "icons/" + p)
        .sort(),
    );
    for (const asset of provenance.assets) {
      expect(asset.license).toBe("MIT");
      expect(asset.author).toBe("Walter Wang");
      expect(
        createHash("sha256")
          .update(readFileSync(root + asset.path))
          .digest("hex"),
      ).toBe(asset.sha256);
    }
  });
  it("pins the reviewed conversion plan and preserves compound/name/path mappings", () => {
    const planPath = fileURLToPath(new URL("./translation-plan.json", import.meta.url));
    expect(createHash("sha256").update(readFileSync(planPath)).digest("hex")).toBe(
      json("provenance.json").translationPlanSha256,
    );
    const { rules } = json("icons.json");
    expect(rules.fileNames["package.json"]).toBe("npm");
    expect(rules.extensions["gradle.kts"]).toBe("gradle");
    expect(rules.extensions["test.ts"]).toBe("test");
    expect(rules.folderNames["node_modules"]).toEqual({ icon: "folder-node", expanded: "folder-node-open" });
    expect(rules.paths.map((r: { pattern: string }) => r.pattern)).toEqual([
      ".github/workflows/*.yml",
      ".github/workflows/*.yaml",
    ]);
  });
});
