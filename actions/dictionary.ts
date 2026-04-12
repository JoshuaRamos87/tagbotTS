import http from "https";
import { BotContext } from '../utils/types.js';
import { sendResponse } from '../utils/response.js';

export function findWord(word: string, context: BotContext, wordAction: 'def' | 'syn') {
    let options = {
        "method": "GET",
        "hostname": "api.dictionaryapi.dev",
        "path": '/api/v2/entries/en_US/',
    };
    options["path"] += word
    let req = http.request(options, function (res) {
    let chunks: Buffer[] = [];
    
    res.on("data", function (chunk) {
        chunks.push(chunk);
    });
    res.on("end", function () {
            let body = Buffer.concat(chunks);
            let jsonObject = JSON.parse(body.toString())  

        if(jsonObject["title"] === "No Definitions Found")
        {
            sendResponse(context, jsonObject["title"]);
            return
        }

            try
            {
            switch(wordAction)
            {
                case "def": displayDef(word, jsonObject, context); break;
                case "syn": displaySyn(word, jsonObject, context); break;
            }
            }catch(err){}
        });
    });
    req.end();
}

function displayDef(word: string, jsonObject: any, context: BotContext)
{
    let str = `**Word: ${word.replace(/%20/g, ' ').trim()}**\n\n`
    for(let l = 0; l < Object.keys(jsonObject).length; l++)
        for(let i = 0; i < Object.keys(jsonObject[l]["meanings"]).length; i++)
        {
            str += "**" + jsonObject[l]["meanings"][i]["partOfSpeech"] + "**" + '\n';
            for(let j = 0; j < Object.keys(jsonObject[l]["meanings"][i]["definitions"]).length; j++)
            {
                str += "-  " + jsonObject[l]["meanings"][i]["definitions"][j]["definition"] + '\n'
            }
        }
    sendResponse(context, str);
}

function displaySyn(word: string, jsonObject: any, context: BotContext)
{
    if(jsonObject["title"] === "No Definitions Found")
    {
        sendResponse(context, jsonObject["title"]);
        return;
    }

    const cleanedWord = word.replace(/%20/g, ' ').trim();
    let synonyms = new Set<string>();

    for(let l = 0; l < Object.keys(jsonObject).length; l++)
    {
        const entry = jsonObject[l];
        for(let i = 0; i < Object.keys(entry["meanings"]).length; i++)
        {
            const meaning = entry["meanings"][i];
            
            // Collect synonyms from meaning level
            if (meaning["synonyms"]) {
                meaning["synonyms"].forEach((s: string) => synonyms.add(s));
            }

            // Collect synonyms from definition level
            for(let j = 0; j < Object.keys(meaning["definitions"]).length; j++)
            {
                const definition = meaning["definitions"][j];
                if (definition["synonyms"]) {
                    definition["synonyms"].forEach((s: string) => synonyms.add(s));
                }
            }
        }
    }

    if(synonyms.size === 0) {
        sendResponse(context, `no synonym found for **${cleanedWord}**`);
    } else {
        let str = `**Synonyms for: ${cleanedWord}**\n\n`;
        synonyms.forEach(s => {
            str += "- " + s + '\n';
        });
        sendResponse(context, str);
    }
}
