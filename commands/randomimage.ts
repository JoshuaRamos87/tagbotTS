import { SlashCommandBuilder } from 'discord.js';
import * as randomimage from '../actions/randomimage.js';

export const data = new SlashCommandBuilder()
    .setName('randomimage')
    .setDescription('Fetches a random image from the channel history');

export async function execute(interaction) {
    console.log(`Command: randomimage | Channel: ${interaction.channelId}`);
    await interaction.deferReply();
    randomimage.getImage(interaction);
}
