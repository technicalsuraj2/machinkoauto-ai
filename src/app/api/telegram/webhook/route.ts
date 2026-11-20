import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  try {
    const update = await request.json();
    const result = await handleTelegramMessage(update);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 });
  }
}

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return NextResponse.json({
    status: token ? "active" : "unconfigured",
    message: token ? "Telegram bot webhook ready" : "Set TELEGRAM_BOT_TOKEN in .env to activate",
  });
}
