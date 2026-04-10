const { SlashCommandBuilder } = require('discord.js');
const randomimage = require('../actions/randomimage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('randomimage')
        .setDescription('Fetches a random image from the channel history')
        .addBooleanOption(option => 
            option.setName('refresh')
                .setDescription('Refresh the image cache for this channel'))
        .addBooleanOption(option => 
            option.setName('sus')
                .setDescription('Search for sus images (experimental)')),
    async execute(interaction) {
        const refresh = interaction.options.getBoolean('refresh') || false;
        const sus = interaction.options.getBoolean('sus') || false;
        await interaction.deferReply();
        randomimage.getImage(interaction, { refresh, sus });
    },
};
