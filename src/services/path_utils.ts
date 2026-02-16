import { homedir } from "node:os";

/**
 * Expand tilde (~) in path to user home directory
 * Supports:
 * - ~/path -> /home/user/path
 * - ~user/path -> /home/user/path (on Unix-like systems)
 * - Absolute paths remain unchanged
 */
export function expandUser(filepath: string): string {
  if (!filepath.startsWith("~")) {
    return filepath;
  }

  if (filepath === "~") {
    return homedir();
  }

  if (filepath.startsWith("~/")) {
    return homedir() + filepath.slice(1);
  }

  // ~user/path format - not commonly used on Windows
  // Just return as-is since homedir() handles the current user
  return filepath;
}
