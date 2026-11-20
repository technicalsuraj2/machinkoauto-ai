# AutoTube Studio

> **Autonomous Google Drive to YouTube Cloud Streaming Pipeline with AI Video Generation**

AutoTube Studio links your Google Drive and YouTube channel. It lets you select videos directly from Google Drive, customize YouTube metadata (title, description, tags, privacy status, child-safety declarations), and stream video files chunk-by-chunk straight into YouTube without downloading multi-gigabyte files to your computer or running out of RAM.

---

## ⚡ Google Cloud Setup & OAuth Configuration

To get your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, follow these steps in the [Google Cloud Console](https://console.cloud.google.com/):

### 1. Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project** > **New Project**, name it `AutoTube Studio`, and click **Create**.

### 2. Enable Required APIs
1. Go to **APIs & Services** > **Library**.
2. Search for and **Enable** the following two APIs:
   - **Google Drive API**
   - **YouTube Data API v3**

### 3. Configure OAuth Consent Screen
1. Go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** and click **Create**.
3. Fill in:
   - **App name**: `AutoTube Studio`
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Click **Save and Continue**.
5. **Scopes** screen:
   Click **Add or Remove Scopes** and add:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
6. **Test Users** screen (**CRITICAL**):
   - Click **Add Users**.
   - Enter your personal Google / Gmail address (and any account you want to upload videos to).
   - *Note: While in Testing status, only added test users can authenticate, and refresh tokens expire in 7 days.*
7. Click **Save and Continue**.

### 4. Create OAuth 2.0 Client Credentials
1. Go to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** > **OAuth client ID**.
3. Select Application type: **Web application**.
4. Name: `AutoTube Localhost Client`.
5. Under **Authorised JavaScript origins**, add:
   ```text
   http://localhost:3000
   ```
6. Under **Authorised redirect URIs**, add these three URIs:
   ```text
   http://localhost:3000/api/auth/callback/google
   http://localhost:3000/api/connect/drive/callback
   http://localhost:3000/api/connect/youtube/callback
   ```
7. Click **Create**.
8. Copy your **Client ID** and **Client Secret** into your `.env` file!

---

## ⚙️ Environment Configuration (`.env`)

Create or update your `.env` file:
```env
# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=d3b07384d113edec49eaa6238ad5ff00f7238495a4efc892b1d368d1f238209a

# Google OAuth 2.0 Credentials (From Google Cloud Console)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google

# Token Encryption (Strictly 32-byte hex key for AES-256-GCM)
TOKEN_ENCRYPTION_KEY=e8a5b2820d82992984bfaec7524958bb5935daaa6781297e682054bbbf76e938

# Database (Default local SQLite for zero-friction launch; switch to PostgreSQL/Supabase anytime)
DATABASE_URL="file:./dev.db"

# Optional: Supabase PostgreSQL (Production / VPS)
# DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public"

# AI Video Generation Provider (mock, fal, replicate, veo)
AI_VIDEO_PROVIDER=mock
AI_VIDEO_API_KEY=
```

---

## 🚀 Running the App Locally

### 1. Run Web and Background Worker together
```bash
npm run dev
```
This runs both the Next.js App Router server and the standalone background worker (`worker.ts`) simultaneously using `concurrently`.

Or run them in separate terminal windows:
```bash
# Terminal 1 (Web Dashboard)
npm run dev:web

# Terminal 2 (Upload Worker)
npm run dev:worker
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing the Encryption Engine
Verify that AES-256-GCM encryption, decryption, and tamper detection are operational:
```bash
npm test
```

---

## 📦 Database & Supabase Switching

- **Default**: SQLite (`dev.db`) is configured by default so you can run the app immediately on localhost without installing or managing a database server.
- **Switch to PostgreSQL (Supabase / Railway)**:
  1. Open `prisma/schema.prisma` and replace `provider = "sqlite"` with `provider = "postgresql"`.
  2. In `.env`, set `DATABASE_URL` to your PostgreSQL / Supabase connection string.
  3. Run:
     ```bash
     npx prisma db push
     ```

---

## ✂️ YouTube Video Clipper & Auto Captions

AutoTube Studio features a built-in autonomous **AI YouTube Video Clipper**:
1. **Download**: `yt-dlp` extracts best quality video and 16kHz audio stream.
2. **Transcription**: `faster-whisper` produces word-level timestamps (supports Hindi Devanagari, English, and Hinglish transliteration).
3. **Viral Moment Detection**: Analyzes transcript energy and humor using LLM (`nvidia/nemotron-3.5-lightning-30b-a3b`) with algorithmic sentence boundary fallback.
4. **9:16 Shorts Conversion**: FFmpeg center-crops video and fills vertical canvas with cinematic ambient blur.
5. **Auto Captions Burn-in**: Generates `.ass` subtitle files with 4 distinct styles (*Classic White, Bold Yellow, Karaoke Word-Glow, Minimalist*) and safe bottom margins for YouTube Shorts UI controls.
6. **Queue Integration**: Add clips individually or all at once with `{n}` bulk title/description templates into the autonomous upload queue.

### Dependencies for Clipper
- **Python**: Installed (with `yt-dlp`, `faster-whisper`, `ctranslate2`)
  ```bash
  python -m pip install yt-dlp faster-whisper ctranslate2
  ```
- **FFmpeg**: Full build with `libass` and `libfreetype` (already verified in system PATH).

---

## ⚠️ Important Compliance & Quota Notes

1. **Daily YouTube Quota (10,000 units)**:
   - Google grants default projects 10,000 quota units per day.
   - Each video upload consumes ~1,600 units (allowing roughly 6 video uploads per day).
   - If the quota is exceeded, the worker pauses until midnight Pacific Time (PT).
2. **Unverified Projects Locked to Private**:
   - Until your Google Cloud Project completes the YouTube API Compliance Audit, YouTube sets videos uploaded through the API to **Private**.
   - To make videos public by default, submit the YouTube API Audit in Google Cloud Console.
3. **7-Day Token Expiry in Testing Mode**:
   - While the OAuth Consent Screen status is "Testing", refresh tokens expire after 7 days. Add your email under "Test Users" in the Google Cloud Console.
