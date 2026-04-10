const { SlashCommandBuilder } = require('discord.js');
const dictionary = require('../actions/dictionary');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('synonym')
        .setDescription('Finds synonyms for a word')
        .addStringOption(option => 
            option.setName('word')
                .setDescription('The word to find synonyms for')
                .setRequired(true)),
    async execute(interaction) {
        const word = interaction.options.getString('word');
        await interaction.deferReply();
        dictionary.findWord(word, interaction, 'syn');
    },
};