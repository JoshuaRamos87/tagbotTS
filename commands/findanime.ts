import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import * as fa from '../actions/findAnime.js';

export const data = new SlashCommandBuilder()
    .setName('findanime')
    .setDescription('Searches for anime source using a screenshot URL')
    .addStringOption(option => 
        option.setName('url')
            .setDescription('The URL of the anime screenshot')
            .setRequired(true))
    .addBooleanOption(option =>
        option.setName('image')
            .setDescription('Include image in results'))
    .addBooleanOption(option =>
        option.setName('video')
            .setDescription('Include video preview in results'))
    .addIntegerOption(option =>
        option.setName('limit')
            .setDescription('Number of results to show'));

export async function execute(interaction: ChatInputCommandInteraction) {
    const url = interaction.options.getString('url', true);
    const flags = {
        image: interaction.options.getBoolean('image'),
        video: interaction.options.getBoolean('video'),
        limit: interaction.options.getInteger('limit')
    };
    await interaction.deferReply();
    fa.findAnime(url, flags, interaction);
}
