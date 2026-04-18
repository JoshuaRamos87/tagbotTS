import { Interaction } from 'discord.js';
import { 
	ERROR_GENERIC, 
	LOG_PREFIX_COMMAND_ERROR, 
	LOG_PREFIX_BUTTON_ERROR, 
	LOG_PREFIX_AUTOCOMPLETE_ERROR, 
	LOG_PREFIX_FATAL_ERROR,
	BUTTON_ID_RANDOM_IMAGE_RELOAD_PREFIX,
	MODAL_ID_PLAY_QUEUE,
	INPUT_ID_PLAY_QUEUE_URLS,
	RESPONSE_QUEUE_UPDATED,
	EMOJI_ERROR
} from './constants/index.js';
import { logError } from './database.js';
import './types.js';

/**
 * Main interaction handler that routes Discord events (commands, buttons, autocomplete)
 * to their respective logic and provides standardized error handling.
 */
export async function handleInteraction(interaction: Interaction) {
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
				console.error(`${LOG_PREFIX_COMMAND_ERROR} /${interaction.commandName}:`, error);
                
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

				const content = `${EMOJI_ERROR} **${ERROR_GENERIC}**\n*(Check logs for technical details)*`;
				
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content, ephemeral: false }).catch(() => {});
				} else {
					await interaction.reply({ content, ephemeral: false }).catch(() => {});
				}
			}
		} else if (interaction.isButton()) {
			// Handle dynamic buttons like image reloading
			if (interaction.customId.startsWith(BUTTON_ID_RANDOM_IMAGE_RELOAD_PREFIX)) {
				const count = parseInt(interaction.customId.split('_').pop() || '1');
				const randomimage = await import('../actions/randomimage.js');
				
				try {
					await interaction.deferUpdate().catch(() => {});
					await randomimage.getImage(interaction, count);
				} catch (error) {
					console.error(`${LOG_PREFIX_BUTTON_ERROR}`, error);
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
				console.error(`${LOG_PREFIX_AUTOCOMPLETE_ERROR} /${interaction.commandName}:`, error);
                logError(error, {
                    method: `autocomplete:${interaction.commandName}`,
                    user_id: interaction.user.id,
                    guild_id: interaction.guildId || undefined,
                    channel_id: interaction.channelId
                });
			}
		} else if (interaction.isModalSubmit()) {
			if (interaction.customId === MODAL_ID_PLAY_QUEUE) {
				const rawUrls = interaction.fields.getTextInputValue(INPUT_ID_PLAY_QUEUE_URLS);
				const urls = rawUrls.split('\n').map(u => u.trim()).filter(u => u.length > 0);
				
				const { updateQueue } = await import('../actions/play.js');
				
				try {
					const playbackStarted = await updateQueue(interaction.guildId || "", urls, interaction);
					
					// Only reply if playback didn't start (if it started, playYouTube already sent the "Now Playing" embed)
					if (!playbackStarted) {
						await interaction.reply({ content: RESPONSE_QUEUE_UPDATED, ephemeral: true });
					}
				} catch (error: any) {
					console.error(`[Modal Error] Failed to update queue:`, error);
					await interaction.reply({ content: `${EMOJI_ERROR} Failed to update queue: ${error.message}`, ephemeral: true });
				}
			}
		}
	} catch (fatalError) {
		console.error(`${LOG_PREFIX_FATAL_ERROR}`, fatalError);
        logError(fatalError, { method: 'interactionCreate:fatal' });
	}
}
