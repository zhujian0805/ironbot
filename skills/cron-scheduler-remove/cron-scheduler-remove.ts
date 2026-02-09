import { removeSkill } from "../cron-scheduler/cron-scheduler.ts";

export const executeSkill = async (input: string): Promise<string> => {
  // Extract job ID from input
  const jobIdMatch = input.match(/(?:id|job[-_\s]?id|job|remove|cancel|delete)\s+([a-f0-9\-]+)/i);
  const jobId = jobIdMatch ? jobIdMatch[1] : null;

  if (!jobId) {
    return "Please provide a valid cron job ID to remove. You can list current jobs to find the ID.";
  }

  return await removeSkill(jobId);
};