# Migration Strategy: Prefix Commands to Discord Slash Commands (v14)

## 1. Overview
The current implementation uses a `messageCreate` listener in `tagbot.ts` and manual parsing in `command.ts` to identify prefix-based commands ($define, $findAnime, etc.) and extract flags/parameters. 

The proposed migration involves:
- Creating a `commands/` directory for individual command modules.
- Using `SlashCommandBuilder` for structured command and option definitions.
- Updating `tagbot.ts` to handle `interactionCreate` events.
- Creating a `deploy-commands.ts` script for command registration with Discord's API.

## 2. Command & Flag Mapping

| Current Command | New Slash Command | Options | Parameters/Flags Mapping |
| :--- | :--- | :--- | :--- |
| `$define <word>` | `/define` | `word` (String, Required) | No change. |
| `$synonym <word>`| `/synonym` | `word` (String, Required) | No change. |
| `$findAnime <URL> [flags]` | `/findanime` | `url` (String, Required), `image` (Boolean, Optional), `video` (Boolean, Optional), `limit` (Integer, Optional) | `-i` -> `image`, `-v` -> `video`, `-l=n` -> `limit`. |
| `$findSauce <URL> [flags]` | `/findsauce` | `url` (String, Required), `gelbooru` (Boolean, Optional) | `-g` -> `gelbooru`. |
| `$translate [lang] [text]` | `/translate` | `language` (String, Required), `text` (String, Required) | Direct mapping. |
| `$randomimage` / `$ri` | `/randomimage` | `refresh` (Boolean, Optional), `sus` (Boolean, Optional) | `-r` -> `refresh`, `-s` -> `sus`. |
| `$randomtweet` / `$rtw` | `/randomtweet` | `refresh` (Boolean, Optional) | `-r` -> `refresh`. |
| `$dolphin "<prompt>"` | `/dolphin` | `prompt` (String, Required) | Quotes no longer needed for parsing. |
| `$version` / `$v` | `/version` | None | No change. |

## 3. Proposed Directory Structure
```
tagbotTS/
├── tagbot.ts           # Updated to handle interactions
├── deploy-commands.ts  # Script to register slash commands
├── commands/           # New directory for slash command logic
│   ├── define.ts
│   ├── findanime.ts
│   ├── findsauce.ts
│   ├── randomimage.ts
│   └── ...
└── actions/            # Keep core logic for reuse (refactored if needed)
    ├── dictionary.ts
    └── ...
```

## 4. Implementation Steps
1. **Refactor Actions:** Update modules in `actions/` to accept a `CommandInteraction` object or simple parameters instead of a `Message` object.
2. **Create Commands:** Implement each command in the `commands/` folder using `SlashCommandBuilder`.
3. **Register Commands:** Create and run `deploy-commands.ts` using your Bot Token and Application ID.
4. **Update Main Bot Logic:**
    - Initialize a `client.commands` Collection.
    - Load command files dynamically.
    - Implement `client.on('interactionCreate', ...)` to execute commands.
5. **(Optional) Keep Legacy Support:** Optionally maintain `messageCreate` as a fallback or for development.
