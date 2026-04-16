# tagbotTS: Foundational Mandates

This file contains critical architectural decisions and workflows that MUST be followed by any agent working on this project.

## 1. Core Architecture
- **Language/Runtime:** TypeScript, Node.js (v20+), ESM (`"type": "module"`).
- **TypeScript Configuration:** `"strict": true` is MANDATORY. All new code must be fully typed without implicit `any` or ignored null checks.
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

## 6. YouTube Chapters & Deep Search (CRITICAL)
- **Extraction Strategy:** To reliably extract chapters, perform a **recursive deep-search** on the `youtubei.js` `VideoInfo` object. Search for nodes where `type` is `MacroMarkersListItem`, `Chapter`, or `Marker`, or nodes containing `timeRangeStartMillis`.
- **Proxy/Reflection Safety:** Avoid using `Reflect.ownKeys` or standard `Map.get` on internal library objects (Proxies), as this causes `TypeError` crashes. Always use safe, defensive property access or recursive object iteration.
- **Fallback Mechanism:** If official metadata is missing, use a regex-based **Description Parser** to scan the video's description for timestamps (e.g., `00:00`, `[01:23]`, `(1:23:45)`).
- **Interactive UI:** Implement a `StringSelectMenuBuilder` (Select Menu) for jumping to chapters. Selections MUST trigger a `seekTo` operation using the `ffmpeg_i` input seek method defined in Section 7.

## 7. Session Persistence & Memory
- **Mandate:** Agents MUST update this file at the end of a session if major technical hurdles were resolved or if new architectural patterns were established.
- **Resolved Roadblock (Strict Mode):** The project was migrated from `strict: false` to `strict: true`. Over 100 type errors were resolved using a unified `BotContext` type and `sendResponse` utility in `utils/`. Future actions must import these from `utils/types.js` and `utils/response.js`.
- **Resolved Roadblock (Seeking):** To reliably seek in YouTube audio via `yt-dlp` when streaming to `stdout`, use `downloader: 'ffmpeg'` and `downloaderArgs: 'ffmpeg_i:-ss <seconds>'`. Using `ffmpeg_i` ensures an "input seek", which is significantly faster and prevents silence/timeouts compared to a standard output seek.
- **Robustness (Basic Errors) & Logging:** Standardize error reporting using a "Basic Error" system (personality-driven fallback messages) and a database-backed exception logger (`error_logs` table) to capture stack traces and context for debugging. Global listeners (`unhandledRejection`, `uncaughtException`) must be active to keep the bot online during library-level failures.

## 8. Environment
- Required `.env` variables: `TOKEN`, `CLIENT_ID`.
- Ensure `ffmpeg-static` is installed as it is required for audio transcoding.
