import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { stopPlayback } from '../actions/play.js';

export const data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops playback and leaves the voice channel');

export async function execute(interaction: ChatInputCommandInteraction) {
    await stopPlayback(interaction);
}
