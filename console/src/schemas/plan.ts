import { z } from "zod";

export const planTriggerSchema = z.object({
  initiative_id: z.string().uuid("Must be a valid initiative ID"),
  template_id: z.enum(["software", "issue_fix", "migration", "factory_ops", "ci_gate", "crew"]).optional().or(z.literal("")),
});

export type PlanTriggerInput = z.infer<typeof planTriggerSchema>;

export const runTriggerSchema = z.object({
  plan_id: z.string().uuid("Must be a valid plan ID"),
  environment: z.enum(["dev", "staging", "prod"]).optional().or(z.literal("")),
});

export type RunTriggerInput = z.infer<typeof runTriggerSchema>;
