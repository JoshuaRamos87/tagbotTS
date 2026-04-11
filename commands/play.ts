import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { playYouTube } from '../actions/play.js';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays audio from a YouTube link in your voice channel')
    .addStringOption(option => 
        option.setName('url')
            .setDescription('The YouTube link to play')
            .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const url = interaction.options.getString('url', true);
    await interaction.deferReply(); 
    await playYouTube(url, interaction);
}
