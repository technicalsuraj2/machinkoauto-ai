export interface GenerationOptions {
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  duration: number; // in seconds
  style?: string;
}

export interface GenerationResult {
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

export interface AIVideoProvider {
  name: string;
  generate(options: GenerationOptions): Promise<{ jobId: string }>;
  checkStatus(jobId: string): Promise<GenerationResult>;
}

import { MockVideoProvider } from "./mock";
import { FalVideoProvider } from "./fal";

export function getVideoProvider(): AIVideoProvider {
  const provider = (process.env.AI_VIDEO_PROVIDER || "mock").toLowerCase();

  switch (provider) {
    case "fal":
      return new FalVideoProvider();
    case "mock":
    default:
      return new MockVideoProvider();
  }
}
