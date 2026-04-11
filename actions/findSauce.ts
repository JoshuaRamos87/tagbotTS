import { searchPic } from "iqdb-client";

export async function findSauce(context,URL,flags)
{
    let result;
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

async function sendResponse(context, content) {
    if (context.reply) {
        if (context.deferred || context.replied) {
            return context.followUp(content);
        }
        return context.reply(content);
    }
    return context.channel.send(content);
}

function displayImageSauce(context,jsonObject)
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
