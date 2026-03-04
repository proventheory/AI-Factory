import { z } from "zod";

export const secretCreateSchema = z.object({
  key: z.string().min(1, "Key is required").regex(/^\S+$/, "Key cannot contain spaces"),
  value: z.string().min(1, "Value is required"),
  environment: z.enum(["dev", "staging", "prod"]).optional().or(z.literal("")),
});

export type SecretCreateInput = z.infer<typeof secretCreateSchema>;
