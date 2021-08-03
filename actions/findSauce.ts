const { searchPic } = require("iqdb-client");


module.exports = {

    findSauce: async function (msg,URL,flags)
    {
      let result;
      //URL = 'https://i.pximg.net/img-original/img/2021/06/24/21/37/50/90781507_p0.jpg';
      msg.channel.send("Loading results...")
      if(flags["-g"])
      {
        result = (await searchPic(URL, { lib: 'gelbooru' }))
      }
      else
      {
        result = (await searchPic(URL, { lib: 'www' }))
      }
      //see ./src/api.test.ts for more examples.
      //console.log(result.data)
      if(result.ok)
      {
        displayImageSauce(msg,result.data);
      }
      else{
        msg.channel.send("No good source found :(");
      }
    }
}

function displayImageSauce(msg,jsonObject)
{
    if(jsonObject[1]["sourceUrl"].includes("https://"))
        msg.channel.send(jsonObject[1]["sourceUrl"])
    else if(jsonObject[1]["sourceUrl"].includes("http://"))
        msg.channel.send(jsonObject[1]["sourceUrl"])
    else
        msg.channel.send("https://" + jsonObject[1]["sourceUrl"].substring(2))
}