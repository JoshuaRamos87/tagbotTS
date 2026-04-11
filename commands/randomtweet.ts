import { SlashCommandBuilder } from 'discord.js';
import * as randomtweet from '../actions/randomtweet.js';

export const data = new SlashCommandBuilder()
    .setName('randomtweet')
    .setDescription('Fetches random tweets from the channel history')
    .addIntegerOption(option => 
        option.setName('count')
            .setDescription('Number of tweets to fetch (1-4)')
            .setMinValue(1)
            .setMaxValue(4));

export async function execute(interaction) {
    const count = interaction.options.getInteger('count') || 1;
    console.log(`Command: randomtweet | Channel: ${interaction.channelId} | Count: ${count}`);
    await interaction.deferReply();
    randomtweet.getTweet(interaction, count);
}
