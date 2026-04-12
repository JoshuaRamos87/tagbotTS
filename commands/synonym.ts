import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import * as dictionary from '../actions/dictionary.js';

export const data = new SlashCommandBuilder()
    .setName('synonym')
    .setDescription('Finds synonyms for a word')
    .addStringOption(option => 
        option.setName('word')
            .setDescription('The word to find synonyms for')
            .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const word = interaction.options.getString('word', true);
    console.log(`Command: synonym | Word: ${word}`);
    await interaction.deferReply();
    dictionary.findWord(word, interaction, 'syn');
}
