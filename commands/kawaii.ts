import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { kawaii } from '../actions/kawaii.js';

export const data = new SlashCommandBuilder()
    .setName('kawaii')
    .setDescription('Posts a random cute kaomoji face!');

export async function execute(interaction: ChatInputCommandInteraction) {
    await kawaii(interaction);
}
