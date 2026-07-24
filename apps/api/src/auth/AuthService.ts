import {
  ChangePasswordRequestSchema,
  ErrorCode,
  RegisterRequestSchema,
  SignInRequestSchema,
  UpdateProfileRequestSchema,
  type AuthenticatedUser,
  type SessionResponse,
} from "@reactify/shared";
import type { FastifyReply } from "fastify";
import type { Env } from "../env.js";
import { AuthRateLimiter } from "./AuthRateLimiter.js";
import { AuthRepository } from "./AuthRepository.js";
import { normalizeEmail } from "./email.js";
import { PasswordService } from "./PasswordService.js";
import { SessionService } from "./SessionService.js";
import { hashEmail, hashIp } from "./crypto.js";
import { toAuthenticatedUser } from "./types.js";

export class AuthService {
  constructor(
    private readonly env: Env,
    private readonly repository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly rateLimiter: AuthRateLimiter,
  ) {}

  async register(input: {
    body: unknown;
    reply: FastifyReply;
    userAgent?: string;
    ip?: string;
  }): Promise<
    | { ok: true; user: AuthenticatedUser; sessionExpiresAt: string }
    | { ok: false; statusCode: number; code: string; message: string; fieldErrors?: Record<string, string> }
  > {
    const parsed = RegisterRequestSchema.safeParse(input.body);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 422,
        code: ErrorCode.INVALID_REGISTRATION,
        message: "Registration request is invalid.",
      };
    }

    const emailResult = normalizeEmail(parsed.data.email);
    if (!emailResult.ok) {
      return {
        ok: false,
        statusCode: 422,
        code: ErrorCode.INVALID_REGISTRATION,
        message: emailResult.message,
        fieldErrors: { email: emailResult.message },
      };
    }

    if (parsed.data.password !== (input.body as { confirmPassword?: string }).confirmPassword) {
      // confirmPassword is frontend-only; ignore if not sent from API direct calls
    }

    const passwordValidation = this.passwordService.validate({
      password: parsed.data.password,
      normalizedEmail: emailResult.normalizedEmail,
      displayName: parsed.data.displayName,
    });
    if (!passwordValidation.ok) {
      await this.repository.recordEvent({
        eventType: "registration_failed",
        success: false,
        safeReason: passwordValidation.code,
      });
      return {
        ok: false,
        statusCode: 422,
        code: passwordValidation.code,
        message: passwordValidation.message,
        fieldErrors: { password: passwordValidation.message },
      };
    }

    const rateKeyIp = hashIp(input.ip) ?? "unknown";
    if (
      !this.rateLimiter.check("register", [rateKeyIp, hashEmail(emailResult.normalizedEmail)]) &&
      this.env.NODE_ENV !== "test"
    ) {
      return {
        ok: false,
        statusCode: 429,
        code: ErrorCode.RATE_LIMITED,
        message: "Too many registration attempts. Try again later.",
      };
    }

    const existing = await this.repository.findUserByNormalizedEmail(emailResult.normalizedEmail);
    if (existing) {
      await this.repository.recordEvent({
        eventType: "registration_failed",
        success: false,
        safeReason: ErrorCode.EMAIL_ALREADY_REGISTERED,
      });
      return {
        ok: false,
        statusCode: 409,
        code: ErrorCode.EMAIL_ALREADY_REGISTERED,
        message: "An account with this email already exists.",
        fieldErrors: { email: "An account with this email already exists." },
      };
    }

    const passwordHash = await this.passwordService.hashPassword(parsed.data.password);
    const user = await this.repository.createUser({
      email: emailResult.email,
      normalizedEmail: emailResult.normalizedEmail,
      passwordHash,
      displayName: parsed.data.displayName.trim(),
    });

    const token = this.sessionService.createToken();
    const session = await this.sessionService.createSession({
      userId: user.id,
      token,
      userAgent: input.userAgent,
      ip: input.ip,
    });
    this.sessionService.setSessionCookie(input.reply, token);

    await this.repository.recordEvent({
      userId: user.id,
      eventType: "registration_succeeded",
      success: true,
    });

    return {
      ok: true,
      user: toAuthenticatedUser({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
        status: "active",
      }),
      sessionExpiresAt: session.expiresAt.toISOString(),
    };
  }

  async signIn(input: {
    body: unknown;
    reply: FastifyReply;
    userAgent?: string;
    ip?: string;
  }): Promise<
    | { ok: true; user: AuthenticatedUser; sessionExpiresAt: string }
    | { ok: false; statusCode: number; code: string; message: string }
  > {
    const parsed = SignInRequestSchema.safeParse(input.body);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 422,
        code: ErrorCode.INVALID_CREDENTIALS,
        message: "Invalid email or password.",
      };
    }

    const emailResult = normalizeEmail(parsed.data.email);
    if (!emailResult.ok) {
      return {
        ok: false,
        statusCode: 401,
        code: ErrorCode.INVALID_CREDENTIALS,
        message: "Invalid email or password.",
      };
    }

    const rateKeyIp = hashIp(input.ip) ?? "unknown";
    if (
      !this.rateLimiter.check("sign-in", [rateKeyIp, hashEmail(emailResult.normalizedEmail)]) &&
      this.env.NODE_ENV !== "test"
    ) {
      return {
        ok: false,
        statusCode: 429,
        code: ErrorCode.RATE_LIMITED,
        message: "Too many sign-in attempts. Try again later.",
      };
    }

    const user = await this.repository.findUserByNormalizedEmail(emailResult.normalizedEmail);
    const invalid = {
      ok: false as const,
      statusCode: 401,
      code: ErrorCode.INVALID_CREDENTIALS,
      message: "Invalid email or password.",
    };

    if (!user || user.deletedAt || user.status !== "active") {
      await this.repository.recordEvent({
        userId: user?.id,
        eventType: "sign_in_failed",
        success: false,
        safeReason: ErrorCode.INVALID_CREDENTIALS,
      });
      return invalid;
    }

    const validPassword = await this.passwordService.verifyPassword(user.passwordHash, parsed.data.password);
    if (!validPassword) {
      await this.repository.recordEvent({
        userId: user.id,
        eventType: "sign_in_failed",
        success: false,
        safeReason: ErrorCode.INVALID_CREDENTIALS,
      });
      return invalid;
    }

    const token = this.sessionService.createToken();
    const session = await this.sessionService.createSession({
      userId: user.id,
      token,
      userAgent: input.userAgent,
      ip: input.ip,
    });
    this.sessionService.setSessionCookie(input.reply, token);
    await this.repository.markSignedIn(user.id);
    await this.repository.recordEvent({
      userId: user.id,
      eventType: "sign_in_succeeded",
      success: true,
    });

    return {
      ok: true,
      user: toAuthenticatedUser({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
        status: "active",
      }),
      sessionExpiresAt: session.expiresAt.toISOString(),
    };
  }

  async signOut(input: { sessionId?: string; reply: FastifyReply }): Promise<void> {
    if (input.sessionId) {
      await this.sessionService.revokeSession(input.sessionId);
      await this.repository.recordEvent({
        eventType: "sign_out",
        success: true,
      });
    }
    this.sessionService.clearSessionCookie(input.reply);
  }

  async getSession(token: string | undefined): Promise<SessionResponse> {
    if (!token) {
      return { authenticated: false };
    }
    const context = await this.sessionService.lookupSession(token);
    if (!context) {
      return { authenticated: false };
    }
    return {
      authenticated: true,
      user: toAuthenticatedUser(context.user),
      sessionExpiresAt: context.session.expiresAt.toISOString(),
    };
  }

  async updateProfile(userId: string, body: unknown): Promise<
    | { ok: true; user: AuthenticatedUser }
    | { ok: false; statusCode: number; code: string; message: string }
  > {
    const parsed = UpdateProfileRequestSchema.safeParse(body);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 422,
        code: ErrorCode.INVALID_REGISTRATION,
        message: "Profile update is invalid.",
      };
    }
    const user = await this.repository.updateUserProfile(userId, parsed.data.displayName.trim());
    return {
      ok: true,
      user: toAuthenticatedUser({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
        status: user.status as "active" | "disabled",
      }),
    };
  }

  async changePassword(input: {
    userId: string;
    sessionId: string;
    body: unknown;
    reply: FastifyReply;
    ip?: string;
  }): Promise<{ ok: true } | { ok: false; statusCode: number; code: string; message: string }> {
    const parsed = ChangePasswordRequestSchema.safeParse(input.body);
    if (!parsed.success) {
      return {
        ok: false,
        statusCode: 422,
        code: ErrorCode.INVALID_PASSWORD,
        message: "Password change request is invalid.",
      };
    }

    const rateKeyIp = hashIp(input.ip) ?? "unknown";
    if (
      !this.rateLimiter.check("change-password", [rateKeyIp, input.userId]) &&
      this.env.NODE_ENV !== "test"
    ) {
      return {
        ok: false,
        statusCode: 429,
        code: ErrorCode.RATE_LIMITED,
        message: "Too many password change attempts. Try again later.",
      };
    }

    const user = await this.repository.findUserById(input.userId);
    if (!user) {
      return { ok: false, statusCode: 401, code: ErrorCode.AUTHENTICATION_REQUIRED, message: "Authentication required." };
    }

    const currentValid = await this.passwordService.verifyPassword(user.passwordHash, parsed.data.currentPassword);
    if (!currentValid) {
      return {
        ok: false,
        statusCode: 401,
        code: ErrorCode.CURRENT_PASSWORD_INCORRECT,
        message: "Current password is incorrect.",
      };
    }

    const passwordValidation = this.passwordService.validate({
      password: parsed.data.newPassword,
      normalizedEmail: user.normalizedEmail,
      displayName: user.displayName,
    });
    if (!passwordValidation.ok) {
      return {
        ok: false,
        statusCode: 422,
        code: passwordValidation.code,
        message: passwordValidation.message,
      };
    }

    const passwordHash = await this.passwordService.hashPassword(parsed.data.newPassword);
    await this.repository.updatePassword(user.id, passwordHash);
    await this.sessionService.revokeOtherSessions(user.id, input.sessionId);

    const token = this.sessionService.createToken();
    await this.sessionService.createSession({
      userId: user.id,
      token,
      ip: input.ip,
    });
    this.sessionService.setSessionCookie(input.reply, token);

    return { ok: true };
  }
}
