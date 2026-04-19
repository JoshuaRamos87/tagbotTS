import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { skipForward } from '../actions/play/index.js';

export const data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skips forward a specified number of seconds in the current video')
    .addIntegerOption(option =>
        option.setName('seconds')
            .setDescription('Number of seconds to skip forward')
            .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const seconds = interaction.options.getInteger('seconds', true);
    await interaction.deferReply(); 
    await skipForward(interaction, seconds);
}
