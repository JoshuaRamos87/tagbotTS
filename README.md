# tagbotTS

**tagbotTS** is a modular Discord bot written in TypeScript, providing utility features ranging from dictionary lookups and anime discovery to high-quality YouTube audio streaming.

## Features

- **Dictionary & Synonyms**: Quick word definitions and synonyms powered by the Free Dictionary API.
- **Anime Discovery**: 
  - `findanime`: Identifies anime from a screenshot URL using the [trace.moe API](https://soruly.github.io/trace.moe-api/).
  - `findsauce`: Finds the original source of anime artwork using [iqdb-client](https://www.npmjs.com/package/iqdb-client).
- **YouTube Audio**: High-performance audio streaming with support for seeking, chapters, and interactive controls.
- **Media Indexing**: Crawls channel history to build a searchable index of images and tweets for random retrieval.

## Getting Started

### Requirements
- **Node.js**: v20.0.0 or higher.
- **FFmpeg**: Required for audio transcoding.
- **Discord Bot Token**: Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with the following variables:
   ```env
   TOKEN=your_discord_bot_token
   CLIENT_ID=your_discord_client_id
   ```

## Usage

### Development & Build
The bot uses TypeScript and must be compiled before running.

- **Deploy Commands**: Registers slash commands with Discord.
  ```bash
  npm run deploy
  ```
- **Run (Windows)**:
  ```bash
  npm run start-win
  ```
- **Run (Linux)**:
  ```bash
  npm run start-linux
  ```

### Commands
All features are accessed via **Slash Commands** (e.g., `/play`, `/define`, `/findanime`). The legacy `$` prefix is no longer supported.

## Author
Joshua Ramos
