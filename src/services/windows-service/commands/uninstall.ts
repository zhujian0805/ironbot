/**
 * Uninstall Command Implementation
 * Handles removal of IronBot Windows service
 */

import type { UninstallResult } from "../types/index.js";

/**
 * Uninstall IronBot service
 */
export async function uninstallService(_serviceName?: string): Promise<UninstallResult> {
  // To be implemented in Phase 6
  throw new Error("Uninstall command not yet implemented");
}
