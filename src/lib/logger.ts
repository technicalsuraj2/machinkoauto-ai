import prisma from "./prisma";

export type LogLevel = "info" | "warn" | "error";

export async function logMessage(userId: string, level: LogLevel, message: string) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] [User: ${userId}] ${message}`);

    return await prisma.log.create({
      data: {
        userId,
        level,
        message,
      },
    });
  } catch (error) {
    console.error("Failed to write log to database:", error);
  }
}
