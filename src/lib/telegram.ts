import prisma from "./prisma";
import { getYoutubeClient } from "./google";
import { runAutonomousDailyPipeline } from "./automation/autoSource";
import fs from "fs";
import path from "path";

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      first_name?: string;
    };
    text?: string;
    date: number;
  };
}

let activeChatId: string | number | null = process.env.TELEGRAM_CHAT_ID || null;
let lastUpdateOffset = 0;
let isPollingActive = false;

export function getTelegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

/**
 * Send a message to Telegram Chat
 */
export async function sendTelegramMessage(chatId: string | number, text: string): Promise<boolean> {
  const token = getTelegramToken();
  if (!token) {
    console.log("[Telegram] Bot token not configured yet. Set TELEGRAM_BOT_TOKEN in .env");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    return res.ok;
  } catch (err: any) {
    console.warn("[Telegram] Error sending message:", err.message);
    return false;
  }
}

/**
 * Broadcast notification to latest active chat & userbot queue
 */
export async function broadcastTelegramAlert(text: string): Promise<boolean> {
  try {
    const queueFile = path.resolve(process.cwd(), "storage", "telegram_notify_queue.jsonl");
    fs.appendFileSync(queueFile, JSON.stringify({ text, timestamp: Date.now() }) + "\n");
  } catch (err) {
    console.warn("[Telegram Notify Queue Write Notice]", err);
  }

  const targetChatId = activeChatId || process.env.TELEGRAM_CHAT_ID;
  if (!targetChatId) return true;
  return sendTelegramMessage(targetChatId, text);
}

/**
 * AI conversational reasoning using LLM (Natural Hindi / Hinglish Chat)
 */
async function getAIChatReply(userPrompt: string, userContext: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.bluesminds.com/v1";
  const model = process.env.LLM_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";

  if (!apiKey) {
    return `Namaste! Main aapka YouTube Automation Assistant hoon. Aap mujhse live subscriber count, uploads, ya queue status poochh sakte hain!`;
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are MachinkoAuto.Ai's personal AI Manager and YouTube growth partner.
You chat directly with the channel creator in genuine, natural, friendly Hindi and Hinglish (like talking to a real human friend, manager, and business partner).
Current System Context: ${userContext}
- Speak casually, warmly, enthusiastically, and intelligently.
- When they greet you, ask for ideas, talk casually, or ask questions, respond like a real human co-creator (e.g. "Arre bhai bilkul...", "Sab badhiya chal raha hai...", "YouTube par abhi yeh trend kar raha hai...").
- Keep replies punchy, natural, helpful (2-4 sentences max), with engaging emojis.
- Never recite automated command lists or sound like a robot unless specifically asked for help.`,
          },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.75,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const aiText = data.choices?.[0]?.message?.content?.trim();
      if (aiText) return aiText;
    }
  } catch (err: any) {
    console.warn("[Telegram LLM] Error calling AI model:", err.message);
  }

  return `Namaste! Main aapka YouTube Automation Assistant hoon. Aaj ka quota: 10 videos. Aap mujhse channel stats, uploads, ya Shorts ke baare me poochh sakte hain! 🚀`;
}

/**
 * Handle incoming Telegram messages with AI logic & live stats
 */
export async function handleTelegramMessage(update: TelegramUpdate): Promise<string> {
  const msg = update.message;
  if (!msg || !msg.text) return "No text message";

  const chatId = msg.chat.id;
  activeChatId = chatId; // Save latest active chat ID for alerts
  const rawText = msg.text.trim();
  const lower = rawText.toLowerCase();

  // Find primary user in database
  const user = await prisma.user.findFirst({
    include: { connections: true, automationSettings: true },
  });

  const setting = user?.automationSettings;
  const todayCount = setting?.todayUploadCount || 0;
  const dailyLimit = setting?.dailyLimit || 10;

  // 1. HELP / START
  if (lower === "/start" || lower === "/help") {
    const welcome = `🤖 *Namaste Suraj bhai! Main aapka personal YouTube AI Manager hoon.*\n\nAap mujhse bilkul normal chat bhi kar sakte hain aur channel manage bhi karwa sakte hain:\n\n• *"video upload karo"* -> Queue ke videos YouTube par upload karna shuru karega\n• *"kitne sub huye he"* -> Live subscriber count dekhein\n• *"aaj kitne video upload huye"* -> Daily limit (10 videos) & quota status\n• *"queue status"* -> Pending videos list\n• */harvest* -> 10 viral GTA 5 Shorts turant auto-generate karein\n\nBataiye Suraj bhai, aaj channel par kya plans hain? 🚀`;
    await sendTelegramMessage(chatId, welcome);
    return "Sent welcome";
  }

  // 2. SUBSCRIBER COUNT / YOUTUBE STATS ("kitne sub huye he")
  if (
    lower.includes("sub") ||
    lower.includes("subscriber") ||
    lower.includes("kitne log") ||
    lower.includes("/stats")
  ) {
    let statsMsg = "⚠️ YouTube account abhi connect nahi hai dashboard me.";
    if (user) {
      try {
        const yt = await getYoutubeClient(user.id);
        const channelRes = await yt.channels.list({
          part: ["snippet", "statistics"],
          mine: true,
        });

        const ch = channelRes.data.items?.[0];
        if (ch) {
          const title = ch.snippet?.title || "YouTube Channel";
          const subs = Number(ch.statistics?.subscriberCount || 0).toLocaleString();
          const views = Number(ch.statistics?.viewCount || 0).toLocaleString();
          const vids = Number(ch.statistics?.videoCount || 0).toLocaleString();

          statsMsg = `📊 *YouTube Channel Live Stats*\n\n🎬 *Channel:* ${title}\n👥 *Subscribers:* ${subs}\n👀 *Total Views:* ${views}\n📹 *Total Videos:* ${vids}\n\n🚀 *Aaj ka Upload:* ${todayCount} / ${dailyLimit} videos`;
        }
      } catch (err: any) {
        statsMsg = `⚠️ YouTube stats fetch karne me error: ${err.message}`;
      }
    }

    await sendTelegramMessage(chatId, statsMsg);
    return "Sent stats";
  }

  // 3. ACTION: TRIGGER VIDEO UPLOAD ("video upload karo", "upload karo", "upload shuru", "/upload")
  if (
    lower.includes("upload karo") ||
    lower.includes("upload start") ||
    lower.includes("video upload") ||
    lower.includes("upload shuru") ||
    lower.includes("upload kar do") ||
    lower === "/upload"
  ) {
    if (user?.id) {
      await prisma.automationSetting.upsert({
        where: { userId: user.id },
        update: { isRunning: true, quotaPausedUntil: null },
        create: { userId: user.id, isRunning: true, dailyLimit: 10, gapMinutes: 15 },
      });

      const pendingCount = await prisma.video.count({
        where: { userId: user.id, status: "pending" },
      });
      const nextVid = await prisma.video.findFirst({
        where: { userId: user.id, status: "pending" },
        orderBy: { orderIndex: "asc" },
      });

      let reply = `🚀 *Hanji bhai! Video Uploading turant shuru kar di hai!*\n\n`;
      if (pendingCount > 0) {
        reply += `📋 *Queue Status:* ${pendingCount} videos pending hain.\n`;
        if (nextVid) reply += `🎬 *Next In Line:* "${nextVid.title.slice(0, 45)}..."\n\n`;
        reply += `Upload complete hone par main turant link ke sath alert bhej dunga! ✅`;
      } else {
        reply += `⚠️ Abhi queue me koi video pending nahi hai. Aap */harvest* ya "gta clip banao" bolkar 10 fresh Shorts banwa sakte hain, fir main upload kar dunga! 🎬`;
      }

      await sendTelegramMessage(chatId, reply);
      return "Triggered video upload";
    }
  }

  // 4. TODAY UPLOADS ("kitne video aaj upload huye", "/today")
  if (
    (lower.includes("upload") && (lower.includes("aaj") || lower.includes("today") || lower.includes("kitne"))) ||
    lower === "/today"
  ) {
    const remaining = Math.max(0, dailyLimit - todayCount);
    const reply = `🚀 *Today's YouTube Upload Status*\n\n✅ *Aaj Upload Huye:* ${todayCount} / ${dailyLimit} videos\n⏳ *Remaining Quota:* ${remaining} videos bachi hain\n⚡ *Automation State:* ${
      setting?.isRunning ? "🟢 Active (Running)" : "⏸️ Paused"
    }\n\nHar 24 ghante me limit auto-refresh ho jati hai!`;

    await sendTelegramMessage(chatId, reply);
    return "Sent today uploads";
  }

  // 4. QUEUE STATUS ("queue status", "kitna samay bacha", "/queue")
  if (
    lower.includes("queue") ||
    lower.includes("kitna samay") ||
    lower.includes("pending video") ||
    lower === "/queue"
  ) {
    const pendingCount = await prisma.video.count({ where: { status: "pending" } });
    const uploadingVideo = await prisma.video.findFirst({
      where: { status: "uploading" },
      select: { title: true, progress: true },
    });

    let queueMsg = `📋 *Video Upload Queue Status*\n\n• *Pending Videos:* ${pendingCount} videos waiting\n`;
    if (uploadingVideo) {
      queueMsg += `• *Currently Uploading:* "${uploadingVideo.title.slice(0, 40)}..." (${uploadingVideo.progress}%)\n`;
    }
    queueMsg += `• *Daily Uploads Today:* ${todayCount} / ${dailyLimit}\n• *Clipping Speed:* ~1.5 se 2 minute per video batch`;

    await sendTelegramMessage(chatId, queueMsg);
    return "Sent queue status";
  }

  // 5. AUTONOMOUS HARVEST TRIGGER ("/harvest", "gta clip banao")
  if (lower.includes("/harvest") || lower.includes("clip banao") || lower.includes("gta clip")) {
    await sendTelegramMessage(
      chatId,
      "🤖 *Autonomous AI Clipper Triggered!*\n\nAI YouTube par GTA 5 gameplay dhoondh raha hai aur 10 vertical Shorts auto-create karke upload queue me daal dega! 🚀"
    );
    if (user?.id) {
      runAutonomousDailyPipeline(user.id).catch((err) => {
        console.error("Telegram-triggered autonomous pipeline error:", err);
      });
    }
    return "Triggered harvest";
  }

  // 6. NATURAL AI CHAT (When user talks normally: "hello", "kaise ho", advice, questions)
  const creatorName = process.env.TELEGRAM_CREATOR_USERNAME
    ? `Suraj Patel (@${process.env.TELEGRAM_CREATOR_USERNAME})`
    : (user?.name || "Creator");
  const userContext = `Creator: ${creatorName}, Channel: ${user?.name || "Gaming"}, Uploaded Today: ${todayCount}/${dailyLimit}, Automation: ${
    setting?.isRunning ? "Active" : "Paused"
  }`;
  const aiReply = await getAIChatReply(rawText, userContext);

  await sendTelegramMessage(chatId, aiReply);
  return "Sent AI chat reply";
}

/**
 * Long-polling daemon for 24/7 background Telegram message processing
 * (Runs automatically in worker.ts)
 */
export async function pollTelegramUpdates(): Promise<void> {
  const token = getTelegramToken();
  if (!token) return;

  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateOffset}&timeout=2`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;

    const data = await res.json();
    if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
      for (const update of data.result) {
        lastUpdateOffset = update.update_id + 1;
        await handleTelegramMessage(update).catch((err) => {
          console.warn("[Telegram Polling] Handler error:", err.message);
        });
      }
    }
  } catch (err) {
    // Timeout or network drop is normal during polling
  }
}
