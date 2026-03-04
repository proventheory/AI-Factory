import { z } from "zod";

export const initiativeCreateSchema = z.object({
  intent_type: z.string().min(1, "Intent type is required"),
  goal_state: z.string().min(1, "Goal state is required").optional(),
  title: z.string().optional(),
  risk_level: z.enum(["low", "med", "high"]).default("low"),
  source_ref: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  template_id: z.enum(["software", "issue_fix", "migration", "factory_ops", "ci_gate", "crew"]).optional().or(z.literal("")),
});

export type InitiativeCreateInput = z.infer<typeof initiativeCreateSchema>;

export const initiativeEditSchema = initiativeCreateSchema;
export type InitiativeEditInput = z.infer<typeof initiativeEditSchema>;
