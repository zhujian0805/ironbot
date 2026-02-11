export function parseAbsoluteTimeMs(value: string): number | null {
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.getTime();
  } catch {
    return null;
  }
}