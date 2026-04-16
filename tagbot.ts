import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { loadCommands } from './utils/commandLoader.js';
import { registerProcessHandlers } from './utils/errorHandler.js';
import { handleInteraction } from './utils/interactionHandler.js';

/**
 * tagbotTS Entry Point
 * 
 * This file orchestrates the Discord client initialization, command loading,
 * and error handler registration. The core logic is distributed across /utils and /actions.
 */

// Extend Discord Client type to include custom commands collection
declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, any>;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Initialize process handlers and load commands using top-level await
registerProcessHandlers();
await loadCommands(client);

client.on("clientReady", () => {
  console.log(`Logged in as ${client.user?.tag}!`)
});

// Route all interactions to the central handler
client.on("interactionCreate", handleInteraction);

// Login to Discord
client.login(process.env.TOKEN);
