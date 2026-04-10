const { SlashCommandBuilder } = require('discord.js');
const dolphin = require('../actions/dolphin');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dolphin')
        .setDescription('Ask Dolphin (Ollama) a question')
        .addStringOption(option => 
            option.setName('prompt')
                .setDescription('The question you want to ask')
                .setRequired(true)),
    async execute(interaction) {
        const prompt = interaction.options.getString('prompt');
        await interaction.deferReply();
        dolphin.askDolphin(interaction, prompt);
    },
};
