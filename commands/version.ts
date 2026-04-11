import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('version')
    .setDescription('Shows the current version of the bot');

export async function execute(interaction) {
    await interaction.reply('Version: 1.3.5');
}
