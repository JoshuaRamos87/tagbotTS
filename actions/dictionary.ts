import { BotContext } from '../utils/types.js';
import { sendResponse } from '../utils/response.js';

export async function findWord(word: string, context: BotContext, wordAction: 'def' | 'syn') {
    const cleanedWord = word.replace(/%20/g, ' ').trim();
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en_US/${encodeURIComponent(cleanedWord)}`;

    try {
        const res = await fetch(url);
        
        if (!res.ok) {
            if (res.status === 404) {
                await sendResponse(context, `No definitions found for **${cleanedWord}**`);
            } else {
                await sendResponse(context, `Error fetching data: ${res.statusText}`);
            }
            return;
        }

        const jsonObject: any = await res.json();

        if (Array.isArray(jsonObject) && jsonObject.length > 0) {
            switch (wordAction) {
                case "def": 
                    displayDef(cleanedWord, jsonObject, context); 
                    break;
                case "syn": 
                    displaySyn(cleanedWord, jsonObject, context); 
                    break;
            }
        } else if (jsonObject.title === "No Definitions Found") {
            await sendResponse(context, jsonObject.title);
        }
    } catch (err: any) {
        console.error("[Dictionary Error]", err.message);
        await sendResponse(context, "An error occurred while looking up the word.");
    }
}

function displayDef(word: string, jsonObject: any[], context: BotContext) {
    let str = `**Word: ${word}**\n\n`;
    for (const entry of jsonObject) {
        for (const meaning of entry.meanings) {
            str += `**${meaning.partOfSpeech}**\n`;
            for (const definition of meaning.definitions) {
                str += `-  ${definition.definition}\n`;
            }
        }
    }
    sendResponse(context, str);
}

function displaySyn(word: string, jsonObject: any[], context: BotContext) {
    const synonyms = new Set<string>();

    for (const entry of jsonObject) {
        for (const meaning of entry.meanings) {
            // Collect synonyms from meaning level
            if (Array.isArray(meaning.synonyms)) {
                meaning.synonyms.forEach((s: string) => synonyms.add(s));
            }

            // Collect synonyms from definition level
            if (Array.isArray(meaning.definitions)) {
                for (const definition of meaning.definitions) {
                    if (Array.isArray(definition.synonyms)) {
                        definition.synonyms.forEach((s: string) => synonyms.add(s));
                    }
                }
            }
        }
    }

    if (synonyms.size === 0) {
        sendResponse(context, `No synonyms found for **${word}**`);
    } else {
        let str = `**Synonyms for: ${word}**\n\n`;
        synonyms.forEach(s => {
            str += `- ${s}\n`;
        });
        sendResponse(context, str);
    }
}
