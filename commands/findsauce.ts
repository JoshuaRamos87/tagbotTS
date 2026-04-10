const { SlashCommandBuilder } = require('discord.js');
const fs = require('../actions/findSauce');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('findsauce')
        .setDescription('Searches for artwork source using IQDB')
        .addStringOption(option => 
            option.setName('url')
                .setDescription('The URL of the artwork')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('gelbooru')
                .setDescription('Use Gelbooru-specific source links')),
    async execute(interaction) {
        const url = interaction.options.getString('url');
        const flags = {
            gelbooru: interaction.options.getBoolean('gelbooru')
        };
        await interaction.deferReply();
        fs.findSauce(interaction, url, flags);
    },
};