import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder,
    PermissionFlagsBits 
} from 'discord.js';
import { SELECT_ID_CLEAR_TIME } from '../utils/constants/index.js';

export const data = new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Safely delete recent bot messages in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🗑️ Clear Bot Messages')
        .setDescription(
            'This command will delete messages **sent by the bot** in this channel.\n\n' +
            'Please select the time range you would like to clear below.'
        )
        .setFooter({ text: 'Note: Discord only allows bulk deletion for messages under 14 days old.' });

    const select = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID_CLEAR_TIME)
        .setPlaceholder('Select a time range...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Last 1 Hour')
                .setDescription('Clear bot messages from the past 60 minutes')
                .setValue('1h'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Last 3 Hours')
                .setDescription('Clear bot messages from the past 3 hours')
                .setValue('3h'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Last 12 Hours')
                .setDescription('Clear bot messages from the past 12 hours')
                .setValue('12h'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Last 24 Hours')
                .setDescription('Clear bot messages from the past 24 hours')
                .setValue('24h'),
            new StringSelectMenuOptionBuilder()
                .setLabel('All Time')
                .setDescription('Attempt to clear EVERY message sent by the bot in this channel')
                .setValue('all')
        );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    await interaction.reply({ 
        embeds: [embed], 
        components: [row], 
        ephemeral: true 
    });
}
