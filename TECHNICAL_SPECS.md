# Technical Specifications: tagbotTS

## Project Overview
**tagbotTS** is a multi-functional Discord bot written in TypeScript. It provides a variety of utility and entertainment features, ranging from dictionary lookups and anime/image source discovery to voice channel audio streaming.

## Core Technology Stack
- **Language:** TypeScript / Node.js
- **Bot Framework:** [discord.js v14](https://discord.js.org/)
- **Runtime:** `node` (production after `tsc` build)
- **APIs & Libraries:**
  - **Dictionary:** [Free Dictionary API](https://dictionaryapi.dev/)
  - **Anime Search:** [trace.moe API](https://soruly.github.io/trace.moe-api/)
  - **Image Sauce:** [iqdb-client](https://www.npmjs.com/package/iqdb-client)
  - **Audio Streaming:** [YouTube.js (Innertube)](https://github.com/LuanRT/YouTube.js) and [@discordjs/voice](https://discord.js.org/docs/packages/voice)

## Architecture
The project follows a modular "action-based" architecture:
- **Entry Point:** `tagbot.ts` initializes the Discord client (v14) and handles Slash Commands.
- **Commands Directory:** `/commands` contains modern Slash Command definitions.
- **Actions:** Individual feature logic is encapsulated in the `actions/` directory (e.g., `dictionary.ts`, `play.ts`).
- **Data Persistence:** [SQLite](https://www.sqlite.org/) (via `better-sqlite3`) is used to store image and tweet metadata.

## Key Features & Command Reference

### 1. Dictionary & Linguistics
- `/define <word>`: Fetches and displays definitions.
- `/synonym <word>`: Fetches and displays synonyms.

### 2. Source Discovery
- `/findanime <URL>`: Searches for anime source using a screenshot URL.
- `/findsauce <URL>`: Searches for artwork source using IQDB.

### 3. Voice & Audio (YouTube)
- `/play <URL>`: Joins the user's voice channel and streams audio.
  - Automatically extracts video IDs from malformed URLs.
  - Uses `YouTube.js` to bypass metadata blocks and `ffmpeg` for stable streaming.
- `/stop`: Stops playback and leaves the voice channel.

### 4. Media & History Crawling
- `/randomimage` (or `/ri`): Fetches a random image from the channel's history (cached in SQLite).
- `/randomtweet` (or `/rtw`): Fetches a random Twitter/X link from the channel's history.

## Technical Implementation Details
- **Build Process:** Uses `npm run build-win` to perform a clean `tsc` compilation into the `build/` directory.
- **Command Deployment:** Uses `npm run deploy` to register Slash Commands with the Discord API.
- **Environment Configuration:** Requires a `.env` file with `TOKEN` and `CLIENT_ID`.

