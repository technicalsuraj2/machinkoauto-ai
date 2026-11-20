export interface FetchVideoInfo {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration: number; // in seconds
  channelTitle?: string;
  viewCount?: number;
}

export interface TranscribedWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscribedSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscribedWord[];
}

export interface ClipMoment {
  clipIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  funScore: number;
  title: string;
  description: string;
  videoPath?: string;
  noCaptionsPath?: string;
}

export type CaptionStyle =
  | "classic"
  | "bold_yellow"
  | "karaoke"
  | "minimal"
  | "hormozi"
  | "beast_punch"
  | "neon_glow"
  | "sub_box"
  | "comic_pop";
export type CaptionPosition = "bottom" | "center" | "top";
export type CaptionLanguage = "auto" | "hi" | "en" | "hinglish";

export interface CaptionOptions {
  style: CaptionStyle;
  position: CaptionPosition;
  fontSize: number;
  maxWordsPerLine: number;
  language: CaptionLanguage;
  fontFamily?: string;
}

export interface ClipperJobInput {
  youtubeUrl: string;
  videoTitle?: string;
  videoThumbnail?: string;
  videoDuration?: number;
  clipCount: number;
  clipLength: "15s" | "30s" | "45s" | "60s" | "auto";
  convertToShorts: boolean;
  autoCaptions: boolean;
  captionLanguage: CaptionLanguage;
  captionStyle: CaptionStyle;
  captionPosition: CaptionPosition;
  fontSize: number;
  maxWordsPerLine: number;
  deleteOriginal: boolean;
}
