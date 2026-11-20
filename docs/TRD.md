# Technical Requirements Document (TRD) - AutoTube Studio

## 1. Overview & Architecture
AutoTube Studio is an automated pipeline application that links Google Drive and YouTube. It enables users to select video files from Google Drive, customize metadata (titles, descriptions, tags, privacy, child-safety declarations), queue them, and stream them directly into YouTube through resumable upload chunks. In addition, it integrates an extensible AI Video Generation framework that pushes generated videos back to Drive and into the upload queue.

```
+-----------------------------------------------------------------------+
|                              Next.js Web App                          |
|  - Auth (NextAuth + Google Provider)                                  |
|  - Connection Manager (Incremental OAuth for Drive & YouTube)         |
|  - Drive Explorer & Video Queue Manager                               |
|  - AI Video Generator & Real-time Logs / Automation Controls          |
+-------------------+-------------------------------+-------------------+
                    |                               |
       REST API     |                               | REST API / SSE
                    v                               v
+-------------------+-------------------------------+-------------------+
|               Database (PostgreSQL via Prisma ORM)                    |
|  - users, connections, videos, automation_settings,                   |
|    generation_jobs, logs                                              |
+-----------------------------------+-----------------------------------+
                                    |
                                    | DB Polling / State Sync
                                    v
+-----------------------------------+-----------------------------------+
|                   Background Worker (worker.ts)                       |
|  - Continuous loop checking is_running automation users               |
|  - Direct Drive-to-YouTube streaming upload (resumable)               |
|  - Token auto-refresh & exponential backoff retry                     |
|  - Quota management (Pacific midnight pause on 403 quotaExceeded)     |
|  - AI Generator rendering & Drive save dispatcher                     |
+-----------------------------------------------------------------------+
```

---

## 2. Tech Stack
- **Framework**: Next.js 14+ (App Router) + TypeScript + Tailwind CSS
- **Database & ORM**: PostgreSQL (Supabase / local / Neon / Railway) with Prisma ORM
- **Authentication**: NextAuth.js (Auth.js) with Google Provider
- **Background Worker**: Standalone Node.js TypeScript process (`worker.ts`) executing independently from the web server
- **Security & Cryptography**: AES-256-GCM authenticated encryption for OAuth refresh tokens
- **APIs**: Google Drive API v3, YouTube Data API v3, Extensible AI Video Provider Adapter

---

## 3. Environment Variables
Stored in `.env` (with template in `.env.example`):
```env
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_minimum_32_chars

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google

# Token Encryption (32-byte hex key for AES-256-GCM)
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/autotube?schema=public

# AI Video Generation (Optional / Extensible)
AI_VIDEO_PROVIDER=fal
AI_VIDEO_API_KEY=
```

---

## 4. Google OAuth & Authorization Flow

### 4.1 Authorised Redirects & Origins
- **Authorised JavaScript origins**:
  - `http://localhost:3000`
- **Authorised redirect URIs**:
  - `http://localhost:3000/api/auth/callback/google` (NextAuth primary authentication)
  - `http://localhost:3000/api/connect/drive/callback` (Incremental OAuth for Google Drive)
  - `http://localhost:3000/api/connect/youtube/callback` (Incremental OAuth for YouTube Upload)

### 4.2 Incremental Scopes
1. **Login Scopes**: `openid`, `email`, `profile`
2. **Drive Scopes**:
   - `https://www.googleapis.com/auth/drive.readonly` (Read and list videos)
   - `https://www.googleapis.com/auth/drive.file` (Save AI-generated videos to dedicated app folder)
3. **YouTube Scopes**:
   - `https://www.googleapis.com/auth/youtube.upload` (Upload videos directly)
   - `https://www.googleapis.com/auth/youtube.readonly` (Verify channel title, ID, and connection status)

### 4.3 Security & Encryption
- OAuth requests use `access_type=offline` and `prompt=consent` to guarantee a refresh token.
- Refresh tokens are encrypted with `AES-256-GCM` using a 12-byte initialization vector (IV) and a 16-byte authentication tag prior to database storage.
- If a token is revoked or expired without refreshability, the connection status transitions to `needs_reconnect`.

---

## 5. Database Schema (Prisma)

### Tables
1. **User** (`users`): NextAuth user table.
2. **Connection** (`connections`):
   - `id`: String (UUID/cuid)
   - `userId`: String -> foreign key to `users.id`
   - `provider`: "drive" | "youtube"
   - `encryptedRefreshToken`: Text (AES-256-GCM payload format: `iv:tag:ciphertext`)
   - `channelName`: String?
   - `channelId`: String?
   - `status`: "connected" | "needs_reconnect" | "disconnected"
   - `updatedAt`: DateTime
3. **Video** (`videos`):
   - `id`: String
   - `userId`: String
   - `driveFileId`: String
   - `fileName`: String
   - `title`: String
   - `description`: Text?
   - `tags`: String? (comma-separated or JSON)
   - `privacy`: "public" | "unlisted" | "private" (Default: "private")
   - `madeForKids`: Boolean (Default: false)
   - `orderIndex`: Int
   - `status`: "pending" | "uploading" | "uploaded" | "failed" | "paused"
   - `youtubeVideoId`: String?
   - `error`: Text?
   - `attempts`: Int (Default: 0)
   - `createdAt`: DateTime
   - `updatedAt`: DateTime
4. **AutomationSetting** (`automation_settings`):
   - `userId`: String (Unique)
   - `gapMinutes`: Int (Default: 15)
   - `dailyLimit`: Int (Default: 6)
   - `isRunning`: Boolean (Default: false)
   - `lastUploadedAt`: DateTime?
5. **GenerationJob** (`generation_jobs`):
   - `id`: String
   - `userId`: String
   - `prompt`: Text
   - `aspectRatio`: String ("16:9" | "9:16" | "1:1")
   - `duration`: Int
   - `style`: String?
   - `status`: "pending" | "processing" | "completed" | "failed"
   - `providerJobId`: String?
   - `driveFileId`: String?
   - `autoUpload`: Boolean
   - `createdAt`: DateTime
6. **Log** (`logs`):
   - `id`: String
   - `userId`: String
   - `level`: "info" | "warn" | "error"
   - `message`: Text
   - `createdAt`: DateTime

---

## 6. Worker Execution Architecture (`worker.ts`)
The worker runs in a separate Node.js process:
1. Runs a scheduled cycle every 5–10 seconds.
2. Queries all `automation_settings` where `isRunning = true`.
3. For each active user:
   - Check if today's upload count reached `dailyLimit` or if quota is currently blocked until midnight Pacific.
   - Check if `lastUploadedAt` + `gapMinutes` has elapsed.
   - Fetch the next `Video` with `status = "pending"` ordered by `orderIndex ASC`.
   - Transition status to `"uploading"`.
   - Decrypt Google Drive and YouTube refresh tokens.
   - Obtain fresh access tokens via Google OAuth2 client.
   - Stream video via Google Drive `drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })`.
   - Pipe the stream directly into `youtube.videos.insert` with resumable upload without writing the whole file to disk.
   - Upon completion: update `youtubeVideoId`, set status to `"uploaded"`, update `lastUploadedAt`, and create an activity log.
   - Upon error: increment `attempts`. If attempts < 3, retry with exponential backoff; if attempts >= 3, set status to `"failed"`.
   - If error is `quotaExceeded` (403), pause queue for that user, log Pacific midnight reset advice.
   - If error is `invalid_grant` or token revoked, set connection status to `needs_reconnect`.

---

## 7. AI Video Generator Architecture
- Interface `AIVideoProvider`:
  - `generate(prompt: string, aspectRatio: string, duration: number, style?: string): Promise<{ jobId: string }>`
  - `checkStatus(jobId: string): Promise<{ status: 'processing' | 'completed' | 'failed', videoUrl?: string, error?: string }>`
- Implemented providers:
  - Mock Provider (instant dev simulation without burning API credits)
  - Extensible adapter for Fal.ai / Replicate / Veo
- The worker downloads the completed video and streams it to Google Drive under folder `"AutoTube Studio/Generated"`.
- If `autoUpload` is true, a `Video` record is automatically created in `pending` status.

---

## 8. Quota & Platform Compliance
- Standard YouTube API quota: 10,000 units/day.
- Video upload consumes ~1,600 units (max ~6 uploads per day).
- Unverified Google Cloud projects are restricted by YouTube to upload videos as "private" only. The UI clearly warns users about this and provides instructions for the YouTube Compliance Audit.
- OAuth consent screen in "Testing" mode allows refresh tokens to remain valid for 7 days for authorized test emails only.
