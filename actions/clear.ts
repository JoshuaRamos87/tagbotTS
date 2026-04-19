import { 
    StringSelectMenuInteraction, 
    ModalSubmitInteraction, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    TextChannel,
    ThreadChannel,
    Message,
    Collection,
    Snowflake
} from 'discord.js';
import { 
    MODAL_ID_CLEAR_CONFIRM, 
    INPUT_ID_CLEAR_CONFIRM, 
    EMOJI_ERROR, 
    EMOJI_SUCCESS 
} from '../utils/constants/index.js';

/**
 * Handles the time selection from the clear command dropdown.
 */
export async function handleClearSelect(interaction: StringSelectMenuInteraction) {
    const value = interaction.values[0];

    if (value === 'all') {
        const modal = new ModalBuilder()
            .setCustomId(MODAL_ID_CLEAR_CONFIRM)
            .setTitle('⚠️ Final Confirmation');

        const input = new TextInputBuilder()
            .setCustomId(INPUT_ID_CLEAR_CONFIRM)
            .setLabel('Type "delete all" to confirm')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('This will attempt to remove EVERY message from the bot.')
            .setRequired(true);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
        modal.addComponents(row);

        await interaction.showModal(modal);
        return;
    }

    // Handle time-based deletion
    await interaction.deferUpdate();
    
    let hours = 0;
    if (value === '1h') hours = 1;
    else if (value === '3h') hours = 3;
    else if (value === '12h') hours = 12;
    else if (value === '24h') hours = 24;

    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const deletedCount = await deleteBotMessages(interaction, cutoff);

    await interaction.editReply({ 
        content: `${EMOJI_SUCCESS} Deleted ${deletedCount} bot messages from the last ${value}.`, 
        embeds: [], 
        components: [] 
    });
}

/**
 * Handles the "All Time" confirmation modal submission.
 */
export async function handleClearModal(interaction: ModalSubmitInteraction) {
    const confirmation = interaction.fields.getTextInputValue(INPUT_ID_CLEAR_CONFIRM);

    if (confirmation.toLowerCase() !== 'delete all') {
        await interaction.reply({ 
            content: `${EMOJI_ERROR} Confirmation failed. You must type "delete all" exactly.`, 
            ephemeral: true 
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });
    
    const deletedCount = await deleteBotMessages(interaction, 0);

    await interaction.editReply({ 
        content: `${EMOJI_SUCCESS} Cleanup complete! Total of ${deletedCount} bot messages removed.`
    });
}

/**
 * Internal helper to fetch and delete bot messages.
 */
async function deleteBotMessages(interaction: StringSelectMenuInteraction | ModalSubmitInteraction, cutoff: number): Promise<number> {
    const channel = interaction.channel as TextChannel | ThreadChannel;
    if (!channel) return 0;
    
    let totalDeleted = 0;
    let totalScanned = 0;
    let idleCounter = 0; // Stop if we scan too many batches with zero bot messages
    let lastId: Snowflake | undefined;
    
    const botId = channel.client.user.id;
    const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const MAX_SCANNED = 5000; // Hard limit for search depth

    while (totalScanned < MAX_SCANNED) {
        const messages: Collection<string, Message> = await channel.messages.fetch({ limit: 100, before: lastId });
        if (messages.size === 0) break;

        totalScanned += messages.size;

        const botMessages = messages.filter(m => 
            m.author.id === botId && 
            (cutoff === 0 || m.createdTimestamp > cutoff)
        );

        if (botMessages.size > 0) {
            idleCounter = 0; // Reset idle counter because we found something

            const bulkable = botMessages.filter(m => m.createdTimestamp > fourteenDaysAgo);
            const manual = botMessages.filter(m => m.createdTimestamp <= fourteenDaysAgo);

            if (bulkable.size > 0) {
                await channel.bulkDelete(bulkable).catch(err => console.error('[BulkDelete Error]', err));
                totalDeleted += bulkable.size;
            }

            if (manual.size > 0) {
                for (const m of manual.values()) {
                    await m.delete().catch(err => console.error('[Manual Delete Error]', err));
                    totalDeleted++;
                }
            }
        } else {
            idleCounter++;
        }

        // Progress Update every ~2 batches (200 messages scanned)
        if (totalScanned % 200 === 0) {
            await interaction.editReply({ 
                content: `🗑️ Scanning... (${totalScanned} messages checked, ${totalDeleted} deleted so far)` 
            }).catch(() => {});
        }

        // EXIT CONDITIONS
        
        // 1. Time Cutoff reached
        const oldestFetched = messages.last();
        if (cutoff !== 0 && oldestFetched && oldestFetched.createdTimestamp < cutoff) break;

        // 2. Idle limit reached (No bot messages in the last 1000 posts)
        if (idleCounter >= 10) break; 

        lastId = oldestFetched?.id;
        if (!lastId) break;
    }

    return totalDeleted;
}
