import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";
import { logMessage } from "@/lib/logger";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  const provider = params.provider.toLowerCase();
  if (provider !== "drive" && provider !== "youtube") {
    return NextResponse.json({ error: "Invalid provider specified" }, { status: 400 });
  }

  const existing = await prisma.connection.findUnique({
    where: {
      userId_provider: {
        userId,
        provider,
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  await prisma.connection.delete({
    where: {
      userId_provider: {
        userId,
        provider,
      },
    },
  });

  await logMessage(userId, "warn", `Disconnected ${provider.toUpperCase()}`);

  return NextResponse.json({ success: true, message: `Disconnected ${provider}` });
}
