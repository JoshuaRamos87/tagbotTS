# Technical Specifications: tagbotTS

## Project Overview
**tagbotTS** is a multi-functional Discord bot written in TypeScript. It provides a variety of utility and entertainment features, ranging from dictionary lookups and language translation to anime/image source discovery and AI-powered interactions.

## Core Technology Stack
- **Language:** TypeScript / Node.js
- **Bot Framework:** [discord.js v13](https://discord.js.org/)
- **Runtime:** `ts-node` (development) / `node` (production after `tsc` build)
- **APIs & Libraries:**
  - **Dictionary:** [Free Dictionary API](https://dictionaryapi.dev/)
  - **Anime Search:** [trace.moe API](https://soruly.github.io/trace.moe-api/)
  - **Image Sauce:** [iqdb-client](https://www.npmjs.com/package/iqdb-client)
  - **Translation:** [@iamtraction/google-translate](https://www.npmjs.com/package/@iamtraction/google-translate)
  - **AI Integration:** Local [Ollama](https://ollama.com/) instance (running `dolphin-mixtral:8x7b`)

## Architecture
The project follows a modular "action-based" architecture:
- **Entry Point:** `tagbot.ts` initializes the Discord client and sets up the message listener.
- **Command Router:** `command.ts` parses incoming messages, identifies commands/flags, and routes them to the appropriate action module.
- **Actions:** Individual feature logic is encapsulated in the `actions/` directory (e.g., `dictionary.ts`, `findAnime.ts`).
- **Data Persistence:** Local JSON files stored in `./data/[channelID]/` are used to cache channel history for specific commands.

## Key Features & Command Reference

### 1. Dictionary & Linguistics
- `$define <word>`: Fetches and displays definitions.
- `$synonym <word>`: Fetches and displays synonyms.
- `$translate [language] [text]`: Translates text using Google Translate. Supports language names or ISO codes.

### 2. Source Discovery
- `$FindAnime [flags] <URL>`: Searches for anime source using a screenshot URL.
  - `-i`: Include image in results.
  - `-v`: Include video preview in results.
  - `-l=<number>`: Limit results (default: 1).
- `$FindSauce [flags] <URL>`: Searches for artwork source using IQDB.
  - `-g`: Use Gelbooru-specific source links.

### 3. Media & History Crawling
These commands crawl the channel's message history to find attachments or links and cache them locally for fast random access.
- `$randomimage` (or `$ri`): Fetches a random image previously posted in the channel.
  - `-r` / `-refresh`: Force a re-crawl of the channel history.
  - `-sus` / `-s`: Access a specific hardcoded "sus" image repository.
- `$randomtweet` (or `$rtw`): Fetches a random Twitter/X link previously posted in the channel.

### 4. AI Interaction (Ollama)
- `$dolphin "<prompt>"` (or `$d`): Sends a quoted prompt to a local Ollama instance running the `dolphin-mixtral:8x7b` model.

### 5. Utilities & Interactions
- **Greetings:** Responds to "gm", "gn", "ga", "good morning", etc.
- **System:** `$help` (command list), `$version` (current version info).

## Technical Implementation Details
- **Data Caching:** To avoid repeated heavy API/Discord calls, the bot scrapes channel history and stores metadata in `./data/[channelID]/images.json` or `tweets.json`.
- **Environment Configuration:** Requires a `.env` file containing a `TOKEN` variable (Discord Bot Token).
- **Error Handling:** Centralized try-catch in the command router with a fallback error message and GIF response to ensure the bot remains online.
- **Build Process:** Uses `tsc` to compile TypeScript to JavaScript in the `build/` directory.

## File Structure
- `tagbot.ts`: Main initialization.
- `command.ts`: Command parsing and routing.
- `actions/`: Feature implementations.
- `data/`: Local cache storage (Git-ignored).
- `tsconfig.json`: TypeScript configuration.
- `package.json`: Dependency and script management.
