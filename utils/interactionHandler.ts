import { 
	Interaction, 
	EmbedBuilder, 
	ModalBuilder, 
	TextInputBuilder, 
	TextInputStyle, 
	ActionRowBuilder 
} from 'discord.js';
import { 
	ERROR_GENERIC, 
	LOG_PREFIX_COMMAND_ERROR, 
	LOG_PREFIX_BUTTON_ERROR, 
	LOG_PREFIX_AUTOCOMPLETE_ERROR, 
	LOG_PREFIX_FATAL_ERROR,
	BUTTON_ID_RANDOM_IMAGE_RELOAD_PREFIX,
	BUTTON_ID_ADD_TRACKS,
	SELECT_ID_REMOVE_TRACK,
	SELECT_ID_CLEAR_TIME,
	MODAL_ID_PLAY_QUEUE,
	MODAL_ID_CLEAR_CONFIRM,
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
			} else if (interaction.customId === BUTTON_ID_ADD_TRACKS) {
				const modal = new ModalBuilder()
					.setCustomId(MODAL_ID_PLAY_QUEUE)
					.setTitle('Add Track(s) to Queue');

				const queueInput = new TextInputBuilder()
					.setCustomId(INPUT_ID_PLAY_QUEUE_URLS)
					.setLabel("YouTube URLs (one per line)")
					.setStyle(TextInputStyle.Paragraph)
					.setPlaceholder('Paste YouTube links here to append them to the current queue...')
					.setRequired(true);

				const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(queueInput);
				modal.addComponents(firstActionRow);

				await interaction.showModal(modal);
			}
		} else if (interaction.isStringSelectMenu()) {
			if (interaction.customId === SELECT_ID_REMOVE_TRACK) {
				const index = parseInt(interaction.values[0]);
				const { removeFromQueue, buildQueueDashboard } = await import('../actions/play/index.js');
				
				try {
					removeFromQueue(interaction.guildId || "", index);
					const dashboard = await buildQueueDashboard(interaction.guildId || "");
					await interaction.update(dashboard);
				} catch (error: any) {
					console.error(`[Select Error] Failed to remove track:`, error);
					await interaction.reply({ content: `${EMOJI_ERROR} Failed to remove track.`, ephemeral: true });
				}
			} else if (interaction.customId === SELECT_ID_CLEAR_TIME) {
				const { handleClearSelect } = await import('../actions/clear.js');
				await handleClearSelect(interaction);
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
				
				const { updateQueue, getTitles, buildQueueDashboard } = await import('../actions/play/index.js');
				
				try {
					// We must acknowledge the modal submit immediately or defer it.
					// Since fetching titles takes time, we defer.
					await interaction.deferReply({ ephemeral: false }); 

					// Append to queue instead of overwriting
					const playbackStarted = await updateQueue(interaction.guildId || "", urls, interaction, true);
					
					// Fetch titles for a "Compact Queue Summary"
					const metadata = await getTitles(urls);
					const queueList = metadata.map((m, i) => `+ [${m.title}](${m.url})`).join('\n');

					const summaryEmbed = new EmbedBuilder()
						.setColor(0x00AE86)
						.setTitle('Tracks Added to Queue')
						.setDescription(queueList || 'No valid links found.')
						.setFooter({ text: `Appended ${urls.length} items.` });

					if (playbackStarted) {
						await interaction.followUp({ embeds: [summaryEmbed] });
					} else {
						// Also show the updated dashboard
						const dashboard = await buildQueueDashboard(interaction.guildId || "");
						await interaction.editReply({ 
							content: `✅ Added ${urls.length} tracks.`,
							embeds: [...(dashboard.embeds || []), summaryEmbed],
							components: dashboard.components 
						});
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
			} else if (interaction.customId === MODAL_ID_CLEAR_CONFIRM) {
				const { handleClearModal } = await import('../actions/clear.js');
				await handleClearModal(interaction);
			}
		}
	} catch (fatalError) {
		console.error(`${LOG_PREFIX_FATAL_ERROR}`, fatalError);
        logError(fatalError, { method: 'interactionCreate:fatal' });
	}
}
