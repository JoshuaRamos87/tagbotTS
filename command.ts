const dictionary = require('./actions/dictionary')
const fa = require('./actions/findAnime')
const fs = require('./actions/findSauce')
const translate = require('./actions/translate')


//finds the command the user has entered
module.exports = function(msg)
{
  try{
    if(msg.toString().includes("$define"))
    {
      let word ="";
      for(let i = 1; msg.toString().split(" ")[i] !== undefined; ++i)
        word = word + msg.toString().split(" ")[i].toLowerCase() + "%20";
    
      console.log(word)

      dictionary.findWord(word,msg,"def")
      word = "";
    }
    else if(msg.toString().includes("$synonym"))
    {
      let word ="";
      for(let i = 1; msg.toString().split(" ")[i] !== undefined; ++i)
        word = word + msg.toString().split(" ")[i].toLowerCase() + "%20";

      console.log(word)
      dictionary.findWord(word,msg,"syn")

      
      word = "";
    }
    else if(msg.toString().includes("$help"))
    {
       msg.channel.send(`$define word`);
       msg.channel.send(`$synonym word`);
       msg.channel.send(`$findAnime (optional flags: -i for image, -v for video, -l=number for number of results) URL`);
       msg.channel.send(`$findSauce (optional flags: -g for gelbooru specific source links from tagbot) URL`);
       msg.channel.send(`$translate [language name/ISO 639-1 code] [text to translate]`);
    }
    else if(msg.toString().includes("$findAnime"))
    {
      let flags ={};
      let urlIndex = 0;
      for(let i = 1; msg.toString().split(" ")[i] !== undefined; ++i)
      {
        urlIndex = i;
        switch(msg.toString().split(" ")[i].toLowerCase())
        {
          case "-i":
          {
            flags["-i"] = true;
            console.log("image = " + flags["-i"])
          }
          break;
          case "-v":
          {
            flags["-v"] = true;
            console.log("video = " + flags["-v"])
          }
        }
        if(msg.toString().split(" ")[i].toLowerCase().includes("-l="))
        {
          let str = msg.toString().split(" ")[i].toLowerCase().substring(3);
          flags["-l"] = parseInt(str);
        }
      }

      fa.findAnime(msg.toString().split(" ")[urlIndex],flags,msg)
      flags = {};
    }
    else if(msg.toString().includes("$findSauce"))
    {
      let flags ={};
      let urlIndex = 0;
      for(let i = 1; msg.toString().split(" ")[i] !== undefined; ++i)
      {
        urlIndex = i;
        if(msg.toString().split(" ")[i].toLowerCase() === "-g")
          flags["-g"] = true;
      }
      let URL = msg.toString().split(" ")[urlIndex]
      //console.log(URL)

      fs.findSauce(msg,URL,flags);
      flags = {};

    }
    else if(msg.toString().includes("$translate"))
    {
      let lang = msg.toString().split(" ")[1].toLowerCase();

      let offset = 10 + 2 + msg.toString().split(" ")[1].toLowerCase().length; //10 = command length, 2 = two spaces, rest = length of target language

      let text = msg.toString().toLowerCase().substring(offset);

      //console.log(str)
      translate(msg,lang,text)
    }
  }
  catch(err){}
}