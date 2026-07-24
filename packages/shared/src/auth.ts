import { z } from "zod";

export const RegisterRequestSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
  displayName: z.string().trim().min(1).max(80),
});

export const SignInRequestSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
});

export const AuthenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  createdAt: z.string().datetime(),
});

export const SessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: AuthenticatedUserSchema.optional(),
  sessionExpiresAt: z.string().datetime().optional(),
});

export const UpdateProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(256),
});

export const ActiveSessionSummarySchema = z.object({
  sessionId: z.string().uuid(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
  currentSession: z.boolean(),
  deviceLabel: z.string(),
});

export const ActiveSessionListResponseSchema = z.object({
  sessions: z.array(ActiveSessionSummarySchema),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type SignInRequest = z.infer<typeof SignInRequestSchema>;
export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type ActiveSessionSummary = z.infer<typeof ActiveSessionSummarySchema>;
export type ActiveSessionListResponse = z.infer<typeof ActiveSessionListResponseSchema>;

/** Fixed UUID assigned to pre-auth development generations during migration. */
export const LEGACY_MIGRATION_USER_ID = "11111111-1111-4111-8111-111111111111";
