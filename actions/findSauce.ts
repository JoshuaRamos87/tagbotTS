// @ts-ignore
import { searchPic, makeSearchFunc, defaultConfig } from "iqdb-client";
import { BotContext } from '../utils/types.js';
import { sendResponse, getUserId } from '../utils/response.js';

import { logError } from '../utils/database.js';
import { 
    LOG_PREFIX_SAUCE, 
    BROWSER_USER_AGENT, 
    ERROR_SAUCE_NOT_FOUND, 
    ERROR_SAUCE_IQDB_FAILED 
} from '../utils/constants/index.js';

// Create a custom search function with a browser-like User-Agent
const customSearchPic = makeSearchFunc({
    ...defaultConfig,
    userAgent: BROWSER_USER_AGENT
});

export async function findSauce(context: BotContext, URL: string, flags: any) {
    console.log(`${LOG_PREFIX_SAUCE} Searching for sauce: ${URL}`);
    await sendResponse(context, "Loading results...");

    try {
        // Download the image using native fetch (Node 22+)
        console.log(`${LOG_PREFIX_SAUCE} Downloading image...`);
        const response = await fetch(URL, {
            headers: {
                "User-Agent": BROWSER_USER_AGENT
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText} (${response.status})`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get("content-type");
        console.log(`${LOG_PREFIX_SAUCE} Downloaded ${buffer.length} bytes. Content-Type: ${contentType}`);

        if (buffer.length === 0) {
            throw new Error("Downloaded image is empty.");
        }

        // Determine library
        const lib = (flags["-g"] || flags["gelbooru"]) ? 'gelbooru' : 'www';
        
        // Prepare filename based on content type or URL
        let fileName = 'image.jpg';
        if (contentType?.includes('png')) fileName = 'image.png';
        else if (contentType?.includes('gif')) fileName = 'image.gif';
        else if (contentType?.includes('webp')) fileName = 'image.webp';

        console.log(`${LOG_PREFIX_SAUCE} Uploading to iqdb (${lib})...`);
        const result = await customSearchPic(buffer, { lib, fileName });

        console.log(`${LOG_PREFIX_SAUCE} iqdb-client result:`, JSON.stringify(result, null, 2));

        if (result.ok && result.data && result.data.length > 0) {
            const match = result.data.find((item: any) => item.sourceUrl && item.head !== 'Your image');
            
            if (match) {
                displayImageSauce(context, match);
            } else {
                await sendResponse(context, ERROR_SAUCE_NOT_FOUND);
            }
        } else if (result.err) {
            console.error(`${LOG_PREFIX_SAUCE} iqdb-client error: ${result.err}`);
            
            // Log IQDB library errors
            logError(result.err, {
                method: 'findSauce:iqdb',
                user_id: getUserId(context),
                guild_id: context.guildId || undefined,
                channel_id: context.channel?.id,
                additional_info: { URL, flags, lib }
            });

            // If IQDB specifically fails to read the result, it might be a temporary server issue or file format issue
            if (result.err.includes("Can't read query result")) {
                await sendResponse(context, ERROR_SAUCE_IQDB_FAILED);
            } else {
                await sendResponse(context, `Error from iqdb: ${result.err}`);
            }
        } else {
            await sendResponse(context, ERROR_SAUCE_NOT_FOUND);
        }
    } catch (err: any) {
        console.error(`${LOG_PREFIX_SAUCE} Unexpected error:`, err);
        logError(err, {
            method: 'findSauce:fatal',
            user_id: getUserId(context),
            guild_id: context.guildId || undefined,
            channel_id: context.channel?.id,
            additional_info: { URL, flags }
        });
        await sendResponse(context, `An error occurred: ${err.message}`);
    }
}

function displayImageSauce(context: BotContext, match: any) {
    let url = match.sourceUrl;
    if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https:" + (url.startsWith("//") ? "" : "//") + url;
    }
    
    sendResponse(context, url || "Source URL missing");
}
