module.exports = {

    findWord: function(word, context, wordAction)
    {
      const http = require("https");
      let options = {
          "method": "GET",
          "hostname": "api.dictionaryapi.dev",
          "path": '/api/v2/entries/en_US/',
      };
      options["path"] += word
      let req = http.request(options, function (res) {
      let chunks = [];
      
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
                    case "def": displayDef(jsonObject, context); break;
                    case "syn": displaySyn(jsonObject, context); break;
                }
              }catch(err){}
          });
      });
      req.end();
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

function displayDef(jsonObject, context)
{
    let str = ''
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

function displaySyn(jsonObject, context)
{
    if(jsonObject["title"] === "No Definitions Found")
    {
        sendResponse(context, jsonObject["title"]);
        return;
    }

    let str = ''
    for(let l = 0; l < Object.keys(jsonObject).length; l++)
    {
        for(let i = 0; i < Object.keys(jsonObject[l]["meanings"]).length; i++)
        {
            for(let j = 0; j < Object.keys(jsonObject[l]["meanings"][i]["definitions"]).length; j++)
            try
            {
                for(let n = 0; n < Object.keys(jsonObject[l]["meanings"][i]["definitions"][j]["synonyms"]).length; n++)
                {
                str += "- " + jsonObject[l]["meanings"][i]["definitions"][j]["synonyms"][n] + '\n'
                }
            }
            catch(err){}
        }
    }
    if(str === '')
        sendResponse(context, "no synonym found");
    else
        sendResponse(context, str);
}