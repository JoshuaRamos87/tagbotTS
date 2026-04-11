import http from "https";

export function findAnime(URL,flags,context)
{
    let options = {
        "method": "GET",
        "hostname": "api.trace.moe",
        "path": '/search?anilistInfo&url=',
    };
    console.log(URL)
    options["path"] += URL

    let req = http.request(options, function (res) {
    let chunks = [];

    res.on("data", function (chunk) {
        chunks.push(chunk);
    });

    res.on("end", function () {
            let body = Buffer.concat(chunks);
            let jsonObject = JSON.parse(body.toString())  

            try{
                displayAnime(jsonObject,context,flags);
            } catch(err){}
        });

    });
    req.end();
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

function displayAnime(jsonObject,context,flags)
{
    let length = flags["-l"] || flags["limit"];
    if(length === undefined || Number.isNaN(length))
        length = 1;

    sendResponse(context, "-----------------------------------------------------------------");
    for(let l = 0; l < length && l < jsonObject["result"].length; l++)
    {
        if(flags["-i"] || flags["image"])
        {
            sendResponse(context, jsonObject["result"][l]["image"]);
        }
        if(flags["-v"] || flags["video"])
        {
            sendResponse(context, jsonObject["result"][l]["video"]);
        }
        sendResponse(context, `title: ${jsonObject["result"][l]["anilist"]["title"]["romaji"]}
similarity: ${jsonObject["result"][l]["similarity"].toFixed(2)}
episode: ${jsonObject["result"][l]["episode"]}
-----------------------------------------------------------------`);
    }               
}
