module.exports = {

    findWord: function(word,msg,wordAction)
    {
        
      const http = require("https");
      let options = {
          "method": "GET",
          "hostname": "api.dictionaryapi.dev",
          "path": '/api/v2/entries/en_US/',
          "headers": 
          {
              'custom': 'Custom Header Demo works'
          }
      };
      options["path"] += word
      let jsonObject;
      let req = http.request(options, function (res) {
      let chunks = [];
      
      res.on("data", function (chunk) {
          chunks.push(chunk);
      });
      res.on("end", function () {
              let body = Buffer.concat(chunks);
              jsonObject = JSON.parse(body.toString())  
    

            if(jsonObject["title"] === "No Definitions Found")
            {
              msg.channel.send(jsonObject["title"])
              return
            }

              try
              {
                switch(wordAction)
                {
                    case "def": displayDef(jsonObject,msg); break;
                    case "syn": displaySyn(jsonObject,msg); break;
                }
              }catch(err){}
              
              
          });
      });
      req.end();
    }
}

function displayDef(jsonObject,msg)
{
    let str = ''
    for(let l = 0; l < Object.keys(jsonObject).length; l++)
        for(let i = 0; i < Object.keys(jsonObject[l]["meanings"]).length; i++)
        for(let j = 0; j < Object.keys(jsonObject[l]["meanings"][i]["definitions"]).length; j++)
        {
            str += "- " + jsonObject[l]["meanings"][i]["definitions"][j]["definition"] + '\n'
        }

    msg.channel.send(str);
}

function displaySyn(jsonObject,msg)
{
    if(jsonObject["title"] === "No Definitions Found")
    {
        msg.channel.send(jsonObject["title"])
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
    msg.channel.send("no synonym found");
    else
    msg.channel.send(str);
}