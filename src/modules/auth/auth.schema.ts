/** Zod schemas for auth form validation — shared between API routes and client forms. */

import { z } from "zod";

export const LoginSchema = z.object({
  username: z
    .string()
    .min(3, "用户名至少 3 个字符")
    .max(20, "用户名最多 20 个字符")
    .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
  password: z.string().min(6, "密码至少 6 个字符"),
});

export const RegisterSchema = LoginSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
