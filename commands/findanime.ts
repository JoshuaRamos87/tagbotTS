const { SlashCommandBuilder } = require('discord.js');
const fa = require('../actions/findAnime');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('findanime')
        .setDescription('Searches for anime source using a screenshot URL')
        .addStringOption(option => 
            option.setName('url')
                .setDescription('The URL of the anime screenshot')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('image')
                .setDescription('Include image in results'))
        .addBooleanOption(option =>
            option.setName('video')
                .setDescription('Include video preview in results'))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of results to show')),
    async execute(interaction) {
        const url = interaction.options.getString('url');
        const flags = {
            image: interaction.options.getBoolean('image'),
            video: interaction.options.getBoolean('video'),
            limit: interaction.options.getInteger('limit')
        };
        await interaction.deferReply();
        fa.findAnime(url, flags, interaction);
    },
};