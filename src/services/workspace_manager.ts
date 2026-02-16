import { existsSync, mkdirSync, accessSync, constants } from "node:fs";
import { expandUser } from "./path_utils.ts";
import { logger } from "../utils/logging.ts";

/**
 * Handles workspace directory initialization, tilde expansion, and validation
 */
export class WorkspaceManager {
  /**
   * Expand tilde (~) in path to user home directory
   */
  static expandPath(filepath: string): string {
    return expandUser(filepath);
  }

  /**
   * Initialize workspace directory with auto-creation and validation
   */
  static initializeWorkspace(workspacePath: string): string {
    if (!workspacePath) {
      throw new Error("Workspace path must be provided");
    }

    // Expand tilde to home directory
    const expandedPath = this.expandPath(workspacePath);

    // Auto-create directory if it doesn't exist
    if (!existsSync(expandedPath)) {
      try {
        mkdirSync(expandedPath, { recursive: true });
        logger.info({ path: expandedPath }, "[WORKSPACE] Created workspace directory");
      } catch (error) {
        throw new Error(
          `Failed to create workspace directory at "${expandedPath}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Validate directory is writable
    try {
      accessSync(expandedPath, constants.W_OK | constants.R_OK);
    } catch (error) {
      throw new Error(
        `Workspace directory "${expandedPath}" is not readable/writable: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    logger.info({ path: expandedPath }, "[WORKSPACE] Workspace ready");
    return expandedPath;
  }

  /**
   * Validate workspace path without creating it
   */
  static validateWorkspace(workspacePath: string): boolean {
    if (!workspacePath) {
      return false;
    }

    const expandedPath = this.expandPath(workspacePath);

    if (!existsSync(expandedPath)) {
      return false;
    }

    try {
      accessSync(expandedPath, constants.W_OK | constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}
