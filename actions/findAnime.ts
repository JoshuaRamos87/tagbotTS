module.exports = {

    findAnime: function(URL,flags,msg)
    {
        const http = require("https");
        let options = {
            "method": "GET",
            "hostname": "api.trace.moe",
            "path": '/search?anilistInfo&url=',
            "headers": 
            {
                'custom': 'Custom Header Demo works'
            }
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
                    //console.log(jsonObject);
                    displayAnime(jsonObject,msg,flags);
                } catch(err){}
            });

        });
        req.end();
    }
}

function displayAnime(jsonObject,msg,flags)
{
    let length = flags["-l"];
    if(length === undefined || Number.isNaN(flags["-l"]))
        length = 1;

    msg.channel.send("-----------------------------------------------------------------");
    for(let l = 0; l < length && l < jsonObject["result"].length; l++)
    {
        if(flags["-i"])
        {
        msg.channel.send(jsonObject["result"][l]["image"]);
        }
        if(flags["-v"])
        {
        msg.channel.send(jsonObject["result"][l]["video"]);
        }
        msg.channel.send(`title: ${jsonObject["result"][l]["anilist"]["title"]["romaji"]}
similarity: ${jsonObject["result"][l]["similarity"].toFixed(2)}
episode: ${jsonObject["result"][l]["episode"]}
-----------------------------------------------------------------`);
    }               
}