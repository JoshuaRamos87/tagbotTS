import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { loadCommands } from './utils/commandLoader.js';
import { registerProcessHandlers } from './utils/errorHandler.js';
import { handleInteraction } from './utils/interactionHandler.js';
import { DISCORD_EVENT_INTERACTION_CREATE, DISCORD_EVENT_CLIENT_READY } from './utils/constants/index.js';
import './utils/types.js';

/**
 * tagbotTS Entry Point
 * 
 * This file orchestrates the Discord client initialization, command loading,
 * and error handler registration. The core logic is distributed across /utils and /actions.
 */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Initialize process handlers and load commands using top-level await
registerProcessHandlers();
await loadCommands(client);

client.on(DISCORD_EVENT_CLIENT_READY, () => {
  console.log('Hello :)');
  console.log(`Logged in as ${client.user?.tag}!`)
});

// Route all interactions to the central handler
client.on(DISCORD_EVENT_INTERACTION_CREATE, handleInteraction);

// Login to Discord
client.login(process.env.TOKEN);
