import { SlashCommandBuilder } from 'discord.js';
import * as randomimage from '../actions/randomimage.js';

export const data = new SlashCommandBuilder()
    .setName('randomimage')
    .setDescription('Fetches random images from the channel history')
    .addIntegerOption(option => 
        option.setName('count')
            .setDescription('Number of images to fetch (1-4)')
            .setMinValue(1)
            .setMaxValue(4));

export async function execute(interaction) {
    const count = interaction.options.getInteger('count') || 1;
    console.log(`Command: randomimage | Channel: ${interaction.channelId} | Count: ${count}`);
    await interaction.deferReply();
    randomimage.getImage(interaction, count);
}
