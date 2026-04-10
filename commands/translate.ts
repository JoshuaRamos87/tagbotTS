const { SlashCommandBuilder } = require('discord.js');
const translate = require('../actions/translate');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translates text to a specified language')
        .addStringOption(option => 
            option.setName('language')
                .setDescription('The target language (e.g., "en", "es", "japanese")')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('text')
                .setDescription('The text to translate')
                .setRequired(true)),
    async execute(interaction) {
        const lang = interaction.options.getString('language');
        const text = interaction.options.getString('text');
        await interaction.deferReply();
        translate(interaction, lang, text);
    },
};
