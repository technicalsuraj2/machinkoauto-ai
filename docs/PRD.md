# Product Requirements Document (PRD) - AutoTube Studio

## 1. Problem Statement
Content creators and automation enthusiasts manage video content across Google Drive and need a hands-free, automated way to queue, schedule, configure, and upload videos to YouTube without manually downloading multi-gigabyte files to local machines and manually filling out upload forms.

## 2. Core Value Proposition
- Direct Cloud-to-Cloud streaming: Videos stream from Google Drive directly to YouTube without saturating local bandwidth or disk space.
- Autonomous scheduling: Background worker respects customizable gaps between uploads and monitors daily YouTube API quotas.
- Incremental authorization: Users can connect their Google Drive and YouTube accounts independently with strict least-privilege scopes.
- AI Video Generation: Option to generate videos using AI and funnel them automatically into Google Drive and the YouTube upload queue.

## 3. User Personas
- **Solo Content Creators**: Schedules daily shorts or videos stored in Google Drive.
- **Automation Agencies**: Automates high-volume scheduled uploads for multiple channels.
- **AI Video Producers**: Automatically synthesizes AI videos and submits them for automated publishing.

## 4. Key Functional Requirements
- **Google OAuth Login**: Easy NextAuth sign-in.
- **Incremental Connection Manager**:
  - Connect Google Drive (read-only for picker, drive.file for generated content).
  - Connect YouTube (upload + channel inspection).
- **Google Drive Video Explorer**:
  - Browse folders or list video files with metadata.
  - Select and import videos directly into the queue.
- **Video Queue & Batch Metadata Editor**:
  - Edit title, description, tags, privacy status (Public, Unlisted, Private), Made-For-Kids declaration.
  - Drag/order index sequencing.
- **Autonomous Upload Engine**:
  - Start, pause, resume, stop controls.
  - Configurable upload gap (e.g., 15 minutes between uploads).
  - Quota safety shield (handles YouTube's 10,000 units/day limit).
  - Resumable streaming upload directly from Drive to YouTube.
- **AI Generator**:
  - Prompt, aspect ratio, duration selection.
  - Dispatches generation, saves to Drive, queues to YouTube.
- **Live Logs & Progress Tracking**:
  - Real-time or polling logs of worker events, errors, retry states, and upload progress.
