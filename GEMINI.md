# tagbotTS: Foundational Mandates

This file contains critical architectural decisions and workflows that MUST be followed by any agent working on this project.

## 1. Core Architecture
- **Language/Runtime:** TypeScript, Node.js (v20+), ESM (`"type": "module"`).
- **Framework:** discord.js v14.
- **Command System:** Exclusively Slash Commands. All legacy prefix (`$`) logic in `tagbot.ts` and `command.ts` has been removed.
- **Persistence:** SQLite via `better-sqlite3`. Metadata for images and tweets must be stored here, not in JSON files.

## 2. YouTube Audio Playback (CRITICAL)
YouTube has aggressive bot detection that blocks standard Node.js libraries. We use a **Hybrid Bypass Strategy**:
- **Metadata:** Use `youtubei.js` (Innertube) to fetch video info and titles.
- **Streaming:** Use `youtube-dl-exec` to spawn a `yt-dlp` binary.
- **Bypass Mechanism:** 
    - Stream raw audio from `yt-dlp`'s `stdout`.
    - Captured as a Node `Readable` stream.
    - Passed to `@discordjs/voice` using `createAudioResource`.
- **Do NOT** attempt to use `ytdl-core` or `play-dl` for streaming; they are frequently blocked with 403 Forbidden errors.

## 3. Rate Limits & Performance
- **Status/Embed Updates:** To avoid Discord API rate limits, the "Now Playing" embed and the bot's presence status MUST NOT be updated more frequently than every **5 seconds**.
- **Build Process:** Always perform a clean build. The `build-win` script uses `rimraf build` before running `tsc`.

## 4. Development Workflow
- **Registration:** Any new command added to `/commands` MUST be registered using `npm run deploy`.
- **Action Pattern:** Keep core logic in the `actions/` directory. Action functions should be designed to handle a generic `context` object that can be either a `ChatInputCommandInteraction` or a legacy `Message` (for future-proofing).

## 6. Session Persistence & Memory
- **Mandate:** Agents MUST update this file at the end of a session if major technical hurdles were resolved or if new architectural patterns were established.
- **Resolved Roadblock (Seeking):** To reliably seek in YouTube audio via `yt-dlp` when streaming to `stdout`, use `downloader: 'ffmpeg'` and `downloaderArgs: 'ffmpeg:-ss <seconds>'`. Other methods (like post-processor args) are inconsistent with piped output.

## 7. Environment
- Required `.env` variables: `TOKEN`, `CLIENT_ID`.
- Ensure `ffmpeg-static` is installed as it is required for audio transcoding.
