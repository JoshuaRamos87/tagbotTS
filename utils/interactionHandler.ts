import { Interaction, EmbedBuilder } from 'discord.js';
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
				
				const { updateQueue, getTitles } = await import('../actions/play.js');
				
				try {
					// We must acknowledge the modal submit immediately or defer it.
					// Since fetching titles takes time, we defer.
					await interaction.deferReply({ ephemeral: false }); 

					const playbackStarted = await updateQueue(interaction.guildId || "", urls, interaction);
					
					// Fetch titles for a "Compact Queue Summary"
					const metadata = await getTitles(urls);
					const queueList = metadata.map((m, i) => `${i + 1}. [${m.title}](${m.url})`).join('\n');

					const summaryEmbed = new EmbedBuilder()
						.setColor(0x00AE86)
						.setTitle('Queue Updated')
						.setDescription(queueList || 'No valid links found.')
						.setFooter({ text: `Total items: ${urls.length}` });

					// If playback started, the "Now Playing" embed was already sent as the first response.
					// We use editReply/followUp to add the summary.
					if (playbackStarted) {
						await interaction.followUp({ embeds: [summaryEmbed] });
					} else {
						await interaction.editReply({ embeds: [summaryEmbed] });
					}
				} catch (error: any) {
					console.error(`[Modal Error] Failed to update queue:`, error);
					// If we already deferred, we must use editReply for the error
					const errorContent = `${EMOJI_ERROR} Failed to update queue: ${error.message}`;
					if (interaction.deferred || interaction.replied) {
						await interaction.editReply({ content: errorContent });
					} else {
						await interaction.reply({ content: errorContent, ephemeral: true });
					}
				}
			}
		}
	} catch (fatalError) {
		console.error(`${LOG_PREFIX_FATAL_ERROR}`, fatalError);
        logError(fatalError, { method: 'interactionCreate:fatal' });
	}
}
