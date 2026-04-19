import { 
    SlashCommandBuilder, 
    ChatInputCommandInteraction, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder 
} from 'discord.js';
import { playYouTube, buildQueueDashboard } from '../actions/play/index.js';
import { MODAL_ID_PLAY_QUEUE, INPUT_ID_PLAY_QUEUE_URLS } from '../utils/constants/index.js';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays audio from YouTube (or manage the queue if no URL provided)')
    .addStringOption(option => 
        option.setName('url')
            .setDescription('The YouTube link to play')
            .setRequired(false))
    .addIntegerOption(option =>
        option.setName('skip')
            .setDescription('Seconds to skip forward into the video')
            .setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
    const url = interaction.options.getString('url');
    const skip = interaction.options.getInteger('skip') || 0;

    if (!url) {
        // No URL provided, show the Queue Dashboard
        await interaction.deferReply();
        const dashboard = await buildQueueDashboard(interaction.guildId || "");
        await interaction.editReply(dashboard);
        return;
    }

    await interaction.deferReply(); 
    await playYouTube(url, interaction, skip);
}

