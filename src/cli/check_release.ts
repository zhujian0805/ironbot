import { Command } from "commander";
import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import { validatePermissionPolicy } from "../validation/permission_policy.ts";
import { logger } from "../utils/logging.ts";

export const runReleaseCheck = (permissionsFile: string): boolean => {
  if (!fs.existsSync(permissionsFile)) {
    logger.error({ path: permissionsFile }, "Permissions file not found");
    return false;
  }

  try {
    const raw = parseYaml(fs.readFileSync(permissionsFile, "utf-8"));
    validatePermissionPolicy(raw);
    logger.info("Release check passed");
    return true;
  } catch (error) {
    logger.error({ error }, "Release check failed");
    return false;
  }
};

const main = () => {
  const program = new Command();
  program.option("--permissions-file <path>", "Path to permissions.yaml", "./permissions.yaml");
  program.parse(process.argv);
  const options = program.opts();

  const ok = runReleaseCheck(options.permissionsFile);
  process.exitCode = ok ? 0 : 1;
};

main();
