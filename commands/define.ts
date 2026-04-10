const { SlashCommandBuilder } = require('discord.js');
const dictionary = require('../actions/dictionary');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('define')
        .setDescription('Defines a word')
        .addStringOption(option => 
            option.setName('word')
                .setDescription('The word to define')
                .setRequired(true)),
    async execute(interaction) {
        const word = interaction.options.getString('word');
        await interaction.deferReply();
        dictionary.findWord(word, interaction, 'def');
    },
};