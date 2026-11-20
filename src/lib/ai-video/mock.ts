import { AIVideoProvider, GenerationOptions, GenerationResult } from "./adapter";

// Store in-memory simulated jobs
const mockJobs = new Map<string, { startTime: number; duration: number }>();

export class MockVideoProvider implements AIVideoProvider {
  name = "mock";

  async generate(options: GenerationOptions): Promise<{ jobId: string }> {
    if (!options.prompt || options.prompt.trim().length === 0) {
      throw new Error("Prompt cannot be empty");
    }

    if (options.duration < 3 || options.duration > 15) {
      throw new Error("Mock video duration must be between 3 and 15 seconds");
    }

    const jobId = `mock_job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    mockJobs.set(jobId, { startTime: Date.now(), duration: options.duration });

    return { jobId };
  }

  async checkStatus(jobId: string): Promise<GenerationResult> {
    const job = mockJobs.get(jobId);
    if (!job) {
      // Return completed with public sample video if not found or server restarted
      return {
        status: "completed",
        videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      };
    }

    const elapsedMs = Date.now() - job.startTime;
    // Simulate generation taking ~6 seconds
    if (elapsedMs < 6000) {
      return { status: "processing" };
    }

    return {
      status: "completed",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    };
  }
}
