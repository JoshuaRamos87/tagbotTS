import { Interaction } from 'discord.js';
import { getBasicError } from './constants.js';
import { logError } from './database.js';

/**
 * Main interaction handler that routes Discord events (commands, buttons, autocomplete)
 * to their respective logic and provides standardized error handling.
 */
export async function handleInteraction(interaction: Interaction) {
	try {
		if (interaction.isChatInputCommand()) {
			const command = (interaction.client as any).commands.get(interaction.commandName);

			if (!command) {
				console.error(`No command matching ${interaction.commandName} was found.`);
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(`[Command Error] /${interaction.commandName}:`, error);
                
                // Persistent database logging
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
			// Handle dynamic buttons like image reloading
			if (interaction.customId.startsWith('random_image_reload_')) {
				const count = parseInt(interaction.customId.split('_').pop() || '1');
				const randomimage = await import('../actions/randomimage.js');
				
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
			const command = (interaction.client as any).commands.get(interaction.commandName);

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
}
