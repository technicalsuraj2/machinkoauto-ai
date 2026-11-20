import prisma from "../../src/lib/prisma";
import { decryptToken } from "../../src/lib/crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function exportEnv() {
  const user = await prisma.user.findFirst({
    include: { connections: true }
  });

  const ytConn = user?.connections.find(c => c.provider === "youtube" && c.status === "connected");
  let ytRefreshToken = "";
  if (ytConn) {
    try {
      ytRefreshToken = decryptToken(ytConn.encryptedRefreshToken);
    } catch (e) {
      console.error("Decrypt error:", e);
    }
  }

  const cloudConfig = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    YOUTUBE_REFRESH_TOKEN: ytRefreshToken,
    FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL || "",
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
    TELEGRAM_CREATOR_USERNAME: "Surajpatel223",
    TELEGRAM_CREATOR_ID: 9052978168,
    LLM_API_KEY: process.env.LLM_API_KEY || "",
    LLM_BASE_URL: process.env.LLM_BASE_URL || "",
    LLM_MODEL: process.env.LLM_MODEL || ""
  };

  const outPath = path.resolve(process.cwd(), "storage", "cloud_env.json");
  fs.writeFileSync(outPath, JSON.stringify(cloudConfig, null, 2), "utf-8");
  console.log("Cloud Config exported successfully to storage/cloud_env.json!");
  console.log("Has YouTube Refresh Token:", Boolean(ytRefreshToken));
}

exportEnv();
