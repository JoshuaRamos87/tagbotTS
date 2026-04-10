const { SlashCommandBuilder } = require('discord.js');
const randomtweet = require('../actions/randomtweet');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('randomtweet')
        .setDescription('Fetches a random tweet from the channel history')
        .addBooleanOption(option => 
            option.setName('refresh')
                .setDescription('Refresh the tweet cache for this channel')),
    async execute(interaction) {
        const refresh = interaction.options.getBoolean('refresh') || false;
        await interaction.deferReply();
        randomtweet.getTweet(interaction, { refresh });
    },
};
