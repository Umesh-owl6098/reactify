import type { PrismaClient } from "@prisma/client";

export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findUserByNormalizedEmail(normalizedEmail: string) {
    return this.prisma.user.findUnique({ where: { normalizedEmail } });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(input: {
    email: string;
    normalizedEmail: string;
    passwordHash: string;
    displayName: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: input.email,
        normalizedEmail: input.normalizedEmail,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        status: "active",
      },
    });
  }

  updateUserProfile(userId: string, displayName: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { displayName, updatedAt: new Date() },
    });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, updatedAt: new Date() },
    });
  }

  markSignedIn(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastSignedInAt: new Date() },
    });
  }

  listActiveSessions(userId: string) {
    return this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findSessionForUser(userId: string, sessionId: string) {
    return this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
  }

  findOwnedImage(userId: string, imageId: string) {
    return this.prisma.uploadedImage.findFirst({
      where: { id: imageId, ownerId: userId },
      select: { id: true },
    });
  }

  recordEvent(input: {
    userId?: string;
    eventType: string;
    success: boolean;
    safeReason?: string;
  }) {
    return this.prisma.authenticationEvent.create({
      data: {
        userId: input.userId,
        eventType: input.eventType,
        success: input.success,
        safeReason: input.safeReason,
      },
    });
  }
}
