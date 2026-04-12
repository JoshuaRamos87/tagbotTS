// @ts-ignore
import { searchPic } from "iqdb-client";
import { BotContext } from '../utils/types.js';
import { sendResponse } from '../utils/response.js';

export async function findSauce(context: BotContext, URL: string, flags: any) {
    let result: any;
    sendResponse(context, "Loading results...")
    if(flags["-g"] || flags["gelbooru"])
    {
    result = (await searchPic(URL, { lib: 'gelbooru' }))
    }
    else
    {
    result = (await searchPic(URL, { lib: 'www' }))
    }
    if(result.ok)
    {
    displayImageSauce(context,result.data);
    }
    else{
    sendResponse(context, "No good source found :(");
    }
}

function displayImageSauce(context: BotContext, jsonObject: any)
{
    let url = "";
    if(jsonObject[1]["sourceUrl"].includes("https://"))
        url = jsonObject[1]["sourceUrl"]
    else if(jsonObject[1]["sourceUrl"].includes("http://"))
        url = jsonObject[1]["sourceUrl"]
    else
        url = "https://" + jsonObject[1]["sourceUrl"].substring(2)
    
    sendResponse(context, url);
}
