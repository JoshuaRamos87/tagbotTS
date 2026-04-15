// @ts-ignore
import { searchPic, makeSearchFunc, defaultConfig } from "iqdb-client";
import { BotContext } from '../utils/types.js';
import { sendResponse } from '../utils/response.js';

// Create a custom search function with a browser-like User-Agent
const customSearchPic = makeSearchFunc({
    ...defaultConfig,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
});

export async function findSauce(context: BotContext, URL: string, flags: any) {
    console.log(`[SAUCE] Searching for sauce: ${URL}`);
    await sendResponse(context, "Loading results...");

    try {
        // Download the image using native fetch (Node 22+)
        console.log(`[SAUCE] Downloading image...`);
        const response = await fetch(URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText} (${response.status})`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get("content-type");
        console.log(`[SAUCE] Downloaded ${buffer.length} bytes. Content-Type: ${contentType}`);

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

        console.log(`[SAUCE] Uploading to iqdb (${lib})...`);
        const result = await customSearchPic(buffer, { lib, fileName });

        console.log(`[SAUCE] iqdb-client result:`, JSON.stringify(result, null, 2));

        if (result.ok && result.data && result.data.length > 0) {
            const match = result.data.find((item: any) => item.sourceUrl && item.head !== 'Your image');
            
            if (match) {
                displayImageSauce(context, match);
            } else {
                await sendResponse(context, "No good source found in the results :(");
            }
        } else if (result.err) {
            console.error(`[SAUCE] iqdb-client error: ${result.err}`);
            
            // If IQDB specifically fails to read the result, it might be a temporary server issue or file format issue
            if (result.err.includes("Can't read query result")) {
                await sendResponse(context, "IQDB is currently having trouble processing this image. This often happens if the image is too large, in an unsupported format, or if their server is overloaded. Please try again later or with a different image.");
            } else {
                await sendResponse(context, `Error from iqdb: ${result.err}`);
            }
        } else {
            await sendResponse(context, "No good source found :(");
        }
    } catch (err: any) {
        console.error(`[SAUCE] Unexpected error:`, err);
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
