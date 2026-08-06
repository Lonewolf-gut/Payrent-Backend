import { prisma } from "@/lib/db/prisma";
import type { NotificationChannel } from "@prisma/client";
import { logger } from "@/lib/logger";
import { sendEmail, buildEmailTemplate } from "@/lib/services/email.service";
import { sendSms } from "@/lib/services/sms.service";

export class NotificationService {
  async create(params: {
    userId: string;
    title: string;
    body: string;
    channel?: NotificationChannel;
    metadata?: Record<string, unknown>;
    sendEmail?: boolean;
    sendSms?: boolean;
  }) {
    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        body: params.body,
        channel: params.channel ?? "IN_APP",
        metadata: params.metadata as object,
      },
    });

    const shouldEmail =
      params.sendEmail !== false &&
      (params.channel === "EMAIL" || params.channel === undefined);

    if (shouldEmail) {
      await this.deliverEmail(params.userId, params.title, params.body);
    }

    if (params.channel === "SMS" || params.sendSms) {
      await this.deliverSms(params.userId, params.body);
    }

    return notification;
  }

  async send(params: {
    userId: string;
    type: string;
    channels: NotificationChannel[];
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) return null;

    const channelRecords = await Promise.all(
      params.channels.map(async (channel) => {
        if (channel === "EMAIL") {
          await this.deliverEmail(params.userId, params.title, params.message);
        }
        if (channel === "SMS") {
          await this.deliverSms(params.userId, params.message);
        }
        return prisma.notification.create({
          data: {
            userId: params.userId,
            title: params.title,
            body: params.message,
            channel,
            metadata: params.metadata as object,
          },
        });
      })
    );

    return channelRecords;
  }

  async deliverEmail(userId: string, subject: string, body: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) {
      return {
        queued: false,
        mode: "log" as const,
        error: "User email address is missing",
      };
    }

    try {
      return await sendEmail({
        to: user.email,
        subject: `[PayForMe] ${subject}`,
        html: buildEmailTemplate(subject, body),
        text: body,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Email delivery failed", { userId, error: message });
      return {
        queued: false,
        mode: "log" as const,
        error: message,
      };
    }
  }

  async deliverSms(userId: string, body: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.phone) return;

    try {
      await sendSms({
        to: user.phone,
        body,
      });
    } catch (error) {
      logger.error("SMS delivery failed", { userId, error: String(error) });
    }
  }

  async markRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  async getAll(userId: string, limit = 100) {
    return prisma.notification.findMany({
      where: { userId, channel: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    return prisma.notification.count({
      where: { userId, read: false, channel: "IN_APP" },
    });
  }

  async getUnread(userId: string, limit = 100) {
    return prisma.notification.findMany({
      where: { userId, read: false, channel: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async clearAll(userId: string) {
    return prisma.notification.deleteMany({
      where: { userId },
    });
  }
}

export const notificationService = new NotificationService();
