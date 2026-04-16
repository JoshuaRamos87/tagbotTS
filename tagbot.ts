import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { pathToFileURL } from 'node:url';
import { getBasicError } from './utils/constants.js';
import { logError } from './utils/database.js';

declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, any>;
  }
}

const mySecret = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Load Commands
client.commands = new Collection();
const commandsPath = path.join(import.meta.dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = await import(pathToFileURL(filePath).href);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

console.log('hello')

// Global Process Error Handling
process.on('unhandledRejection', (reason, promise) => {
	console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
    logError(reason, { method: 'unhandledRejection' });
});

process.on('uncaughtException', (error) => {
	console.error('[Uncaught Exception] thrown:', error);
    logError(error, { method: 'uncaughtException' });
});

client.on("clientReady", () => {
  console.log(`Logged in as ${client.user?.tag}!`)
});

// Slash Command Handler
client.on("interactionCreate", async interaction => {
	try {
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(`[Command Error] /${interaction.commandName}:`, error);
                
                // Log exception to DB
                logError(error, {
                    method: `command:${interaction.commandName}`,
                    user_id: interaction.user.id,
                    guild_id: interaction.guildId || undefined,
                    channel_id: interaction.channelId,
                    additional_info: {
                        options: interaction.options.data
                    }
                });

				const content = `❌ **${getBasicError()}**\n*(Check logs for technical details)*`;
				
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content, ephemeral: false }).catch(() => {});
				} else {
					await interaction.reply({ content, ephemeral: false }).catch(() => {});
				}
			}
		} else if (interaction.isButton()) {
			if (interaction.customId.startsWith('random_image_reload_')) {
				const count = parseInt(interaction.customId.split('_').pop() || '1');
				const randomimage = await import('./actions/randomimage.js');
				
				try {
					await interaction.deferUpdate().catch(() => {});
					await randomimage.getImage(interaction, count);
				} catch (error) {
					console.error("[Button Error]", error);
                    logError(error, {
                        method: 'button:random_image_reload',
                        user_id: interaction.user.id,
                        guild_id: interaction.guildId || undefined,
                        channel_id: interaction.channelId
                    });
				}
			}
		} else if (interaction.isAutocomplete()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				if (command.autocomplete) {
					await command.autocomplete(interaction);
				}
			} catch (error) {
				console.error(`[Autocomplete Error] /${interaction.commandName}:`, error);
                logError(error, {
                    method: `autocomplete:${interaction.commandName}`,
                    user_id: interaction.user.id,
                    guild_id: interaction.guildId || undefined,
                    channel_id: interaction.channelId
                });
			}
		}
	} catch (fatalError) {
		console.error("[FATAL INTERACTION ERROR]", fatalError);
        logError(fatalError, { method: 'interactionCreate:fatal' });
	}
});

client.login(mySecret);
