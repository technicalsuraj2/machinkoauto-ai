import { AIVideoProvider, GenerationOptions, GenerationResult } from "./adapter";

export class FalVideoProvider implements AIVideoProvider {
  name = "fal";

  private getApiKey(): string {
    const key = process.env.AI_VIDEO_API_KEY;
    if (!key) {
      throw new Error("AI_VIDEO_API_KEY is required for Fal.ai video generation.");
    }
    return key;
  }

  async generate(options: GenerationOptions): Promise<{ jobId: string }> {
    const apiKey = this.getApiKey();

    const response = await fetch("https://queue.fal.run/fal-ai/fast-svd/text-to-video", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: options.prompt,
        aspect_ratio: options.aspectRatio,
        duration: options.duration,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Fal.ai API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return { jobId: data.request_id };
  }

  async checkStatus(jobId: string): Promise<GenerationResult> {
    const apiKey = this.getApiKey();

    const response = await fetch(`https://queue.fal.run/fal-ai/fast-svd/requests/${jobId}/status`, {
      headers: {
        Authorization: `Key ${apiKey}`,
      },
    });

    if (!response.ok) {
      return { status: "failed", error: `Failed to query Fal.ai job: ${response.statusText}` };
    }

    const data = await response.json();
    if (data.status === "IN_QUEUE" || data.status === "IN_PROGRESS") {
      return { status: "processing" };
    }

    if (data.status === "COMPLETED") {
      // Fetch result
      const resultRes = await fetch(`https://queue.fal.run/fal-ai/fast-svd/requests/${jobId}`, {
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      });
      const resultData = await resultRes.json();
      return {
        status: "completed",
        videoUrl: resultData.video?.url || resultData.output?.url,
      };
    }

    return {
      status: "failed",
      error: data.error || "Fal.ai generation failed",
    };
  }
}
