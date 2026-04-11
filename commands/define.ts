import { SlashCommandBuilder } from 'discord.js';
import * as dictionary from '../actions/dictionary.js';

export const data = new SlashCommandBuilder()
    .setName('define')
    .setDescription('Defines a word')
    .addStringOption(option => 
        option.setName('word')
            .setDescription('The word to define')
            .setRequired(true));

export async function execute(interaction) {
    const word = interaction.options.getString('word');
    console.log(`Command: define | Word: ${word}`);
    await interaction.deferReply();
    dictionary.findWord(word, interaction, 'def');
}
