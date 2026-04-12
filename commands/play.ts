import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { playYouTube } from '../actions/play.js';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays audio from a YouTube link in your voice channel')
    .addStringOption(option => 
        option.setName('url')
            .setDescription('The YouTube link to play')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('skip')
            .setDescription('Seconds to skip forward into the video')
            .setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
    const url = interaction.options.getString('url', true);
    const skip = interaction.options.getInteger('skip') || 0;
    await interaction.deferReply(); 
    await playYouTube(url, interaction, skip);
}
