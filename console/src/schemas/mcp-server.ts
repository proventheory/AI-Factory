import { z } from "zod";

export const mcpServerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  server_type: z.string().min(1, "Server type is required"),
  url_or_cmd: z.string().min(1, "URL or command is required"),
  auth_header: z.string().optional(),
  capabilities: z.string().optional(),
  active: z.boolean().default(true),
});

export type McpServerInput = z.infer<typeof mcpServerSchema>;
