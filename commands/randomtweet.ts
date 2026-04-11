import { SlashCommandBuilder } from 'discord.js';
import * as randomtweet from '../actions/randomtweet.js';

export const data = new SlashCommandBuilder()
    .setName('randomtweet')
    .setDescription('Fetches a random tweet from the channel history')
    .addBooleanOption(option => 
        option.setName('refresh')
            .setDescription('Refresh the tweet cache for this channel'));

export async function execute(interaction) {
    const refresh = interaction.options.getBoolean('refresh') || false;
    await interaction.deferReply();
    randomtweet.getTweet(interaction, { refresh });
}
