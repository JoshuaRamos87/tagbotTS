const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('version')
        .setDescription('Shows the current version of the bot'),
    async execute(interaction) {
        await interaction.reply('Version: 1.3.5');
    },
};
