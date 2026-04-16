import { BotContext } from '../utils/types.js';
import { sendResponse, getUserId } from '../utils/response.js';
import { logError } from '../utils/database.js';

export async function findAnime(URL: string, flags: any, context: BotContext) {
    const url = `https://api.trace.moe/search?anilistInfo&url=${encodeURIComponent(URL)}`;

    try {
        const res = await fetch(url);
        
        if (!res.ok) {
            throw new Error(`trace.moe API error: ${res.status} ${res.statusText}`);
        }

        const jsonObject: any = await res.json();
        displayAnime(jsonObject, context, flags);
    } catch (err: any) {
        console.error("[findAnime Error]", err.message);
        logError(err, {
            method: 'findAnime',
            user_id: getUserId(context),
            guild_id: context.guildId || undefined,
            channel_id: context.channel?.id,
            additional_info: { URL, flags }
        });
        await sendResponse(context, "An error occurred while searching for the anime.");
    }
}

function displayAnime(jsonObject: any, context: BotContext, flags: any) {
    let length = flags["-l"] || flags["limit"];
    if (length === undefined || Number.isNaN(length))
        length = 1;

    if (!jsonObject.result || jsonObject.result.length === 0) {
        sendResponse(context, "No anime found for this image.");
        return;
    }

    sendResponse(context, "-----------------------------------------------------------------");
    for (let l = 0; l < length && l < jsonObject["result"].length; l++) {
        const result = jsonObject["result"][l];
        if (flags["-i"] || flags["image"]) {
            sendResponse(context, result["image"]);
        }
        if (flags["-v"] || flags["video"]) {
            sendResponse(context, result["video"]);
        }
        sendResponse(context, `title: ${result["anilist"]["title"]["romaji"]}
similarity: ${result["similarity"].toFixed(2)}
episode: ${result["episode"]}
-----------------------------------------------------------------`);
    }               
}
