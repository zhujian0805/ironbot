import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const readJson = async (filePath: string) => JSON.parse(await readFile(filePath, "utf-8"));

describe("quickstart workflow", () => {
  it("exposes the expected npm scripts", async () => {
    const pkg = await readJson(join(process.cwd(), "package.json"));
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
  });
});
