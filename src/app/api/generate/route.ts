import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, unauthorizedResponse } from "@/lib/session";
import prisma from "@/lib/prisma";
import { getVideoProvider } from "@/lib/ai-video/adapter";
import { logMessage } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { prompt, aspectRatio = "16:9", duration = 5, style, autoUpload = false } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    if (!["16:9", "9:16", "1:1"].includes(aspectRatio)) {
      return NextResponse.json(
        { error: "Invalid aspect ratio. Must be 16:9, 9:16, or 1:1" },
        { status: 400 }
      );
    }

    const provider = getVideoProvider();
    const { jobId } = await provider.generate({
      prompt,
      aspectRatio,
      duration: Number(duration),
      style,
    });

    const job = await prisma.generationJob.create({
      data: {
        userId,
        prompt,
        aspectRatio,
        duration: Number(duration),
        style: style || null,
        providerJobId: jobId,
        status: "processing",
        autoUpload: Boolean(autoUpload),
      },
    });

    await logMessage(
      userId,
      "info",
      `Dispatched AI video generation job: "${prompt.slice(0, 40)}..." (Provider: ${provider.name})`
    );

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    console.error("Failed to generate AI video:", err);
    return NextResponse.json(
      { error: err.message || "Failed to initiate AI video generation" },
      { status: 500 }
    );
  }
}
