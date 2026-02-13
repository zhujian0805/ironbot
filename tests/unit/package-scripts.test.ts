import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Package.json Scripts", () => {
  const packageJsonPath = join(process.cwd(), "package.json");
  let packageJson: any;

  beforeAll(() => {
    const packageJsonContent = readFileSync(packageJsonPath, "utf-8");
    packageJson = JSON.parse(packageJsonContent);
  });

  describe("Windows Service Scripts", () => {
    const expectedServiceScripts = {
      "service:install": "bun src/main.ts windows-service install",
      "service:uninstall": "bun src/main.ts windows-service uninstall",
      "service:start": "bun src/main.ts windows-service start",
      "service:stop": "bun src/main.ts windows-service stop",
      "service:restart": "bun src/main.ts windows-service restart",
      "service:status": "bun src/main.ts windows-service status",
      "service:logs": "bun src/main.ts windows-service logs"
    };

    it("should have all Windows service scripts defined", () => {
      expect(packageJson.scripts).toBeDefined();
      expect(typeof packageJson.scripts).toBe("object");
    });

    Object.entries(expectedServiceScripts).forEach(([scriptName, expectedCommand]) => {
      it(`should have ${scriptName} script with correct command`, () => {
        expect(packageJson.scripts[scriptName]).toBe(expectedCommand);
      });
    });

    it("should have all expected service scripts", () => {
      const scriptNames = Object.keys(packageJson.scripts);
      const serviceScriptNames = Object.keys(expectedServiceScripts);

      serviceScriptNames.forEach(scriptName => {
        expect(scriptNames).toContain(scriptName);
      });
    });

    it("should have correct command format for all service scripts", () => {
      Object.entries(expectedServiceScripts).forEach(([scriptName, expectedCommand]) => {
        expect(packageJson.scripts[scriptName]).toBe(expectedCommand);
        expect(packageJson.scripts[scriptName]).toMatch(/^bun src\/main\.ts windows-service \w+$/);
      });
    });
  });

  describe("Script Structure", () => {
    it("should have scripts section", () => {
      expect(packageJson.scripts).toBeDefined();
      expect(typeof packageJson.scripts).toBe("object");
    });

    it("should have basic application scripts", () => {
      const requiredScripts = ["dev", "build", "start", "test"];

      requiredScripts.forEach(scriptName => {
        expect(packageJson.scripts[scriptName]).toBeDefined();
        expect(typeof packageJson.scripts[scriptName]).toBe("string");
        expect(packageJson.scripts[scriptName].length).toBeGreaterThan(0);
      });
    });
  });
});