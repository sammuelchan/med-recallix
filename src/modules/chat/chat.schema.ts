import { z } from "zod";

export const SendMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().optional(),
  bootstrap: z.boolean().optional(),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;
