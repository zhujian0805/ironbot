import { z } from "zod";

const ToolRestrictionSchema = z
  .object({
    allowed_commands: z.array(z.string()).optional(),
    blocked_commands: z.array(z.string()).optional(),
    allowed_paths: z.array(z.string()).optional(),
    timeout_max: z.number().int().positive().optional(),
    override_prompt: z.boolean().optional()
  })
  .strict();

const McpSettingsSchema = z
  .object({
    allowed_paths: z.array(z.string()).optional(),
    allowed_repos: z.array(z.string()).optional()
  })
  .strict();

export const PermissionPolicySchema = z
  .object({
    version: z.string().optional(),
    blocked_commands: z.array(z.string()).optional(),
    settings: z
      .object({
        default_deny: z.boolean().optional(),
        log_denials: z.boolean().optional(),
        enable_override_prompt: z.boolean().optional()
      })
      .optional(),
    tools: z
      .object({
        allowed: z.array(z.string()).optional(),
        restrictions: z.record(ToolRestrictionSchema).optional()
      })
      .optional(),
    skills: z
      .object({
        allowed: z.array(z.string()).optional()
      })
      .optional(),
    mcps: z
      .object({
        allowed: z.array(z.string()).optional(),
        settings: z.record(McpSettingsSchema).optional()
      })
      .optional(),
    resources: z
      .object({
        denied_paths: z.array(z.string()).optional(),
        denied_patterns: z.array(z.string()).optional()
      })
      .optional()
  })
  .strict();

export const validatePermissionPolicy = (input: unknown) => PermissionPolicySchema.parse(input);
