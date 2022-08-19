const dictionary = require('./actions/dictionary')
const fa = require('./actions/findAnime')
const fs = require('./actions/findSauce')
const translate = require('./actions/translate')
const randomimage = require('./actions/randomimage')
const randomtweet = require('./actions/randomtweet')


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
      msg.channel.send(`$randomImage : $ri`);
      msg.channel.send(`$randomTweet : $rtw`);
    }
    else if(msg.toString().includes("$FindAnime"))
    {
      //ret finds is just an object that holds the results of the getFindAnimeFlags
      //just holds the urlIndex and the flags object
      let ret = getFindAnimeFlags(msg);

      fa.findAnime(msg.toString().split(" ")[ret.urlIndex],ret.flags,msg)
      ret.flags = {};
    }
    else if(msg.toString().includes("$FindSauce"))
    {
      let ret = getSauceFlags(msg);
      let URL = msg.toString().split(" ")[ret.urlIndex];
      fs.findSauce(msg,URL,ret.flags);
      ret.flags = {};

    }
    else if(msg.toString().includes("$translate"))
    {
      let lang = msg.toString().split(" ")[1].toLowerCase();

      let offset = 10 + 2 + msg.toString().split(" ")[1].toLowerCase().length; //10 = command length, 2 = two spaces, rest = length of target language

      let text = msg.toString().toLowerCase().substring(offset);

      //console.log(str)
      translate(msg,lang,text)
    }
    else if(msg.toString().includes("$version") || 
            msg.toString().includes("$ver") || 
            msg.toString().includes("$v"))
    {
      msg.channel.send("Version: 1.3.5");
    }
    else if(msg.toString().toLowerCase().includes("goodmorning") || 
           (msg.toString().toLowerCase() == "gm") ||
           msg.toString().toLowerCase().includes("good morning") )
          {
            msg.channel.send("Good Morning!");
          }
    else if(msg.toString().toLowerCase().includes("goodnight") || 
           (msg.toString().toLowerCase() == "gn") ||
           msg.toString().toLowerCase().includes("good night") )
          {
            msg.channel.send("Good Night!");
          }
    else if(msg.toString().toLowerCase().includes("goodafternoon") ||
            (msg.toString().toLowerCase() == "ga") ||
            msg.toString().toLowerCase().includes("good afternoon") )
          {
            msg.channel.send("Good Afternoon!");
          }
    else if(msg.toString().toLowerCase().includes("$randomimage") || msg.toString().toLowerCase().includes("$ri")){
      
      let flags = getRandomFlags(msg);

      randomimage.getImage(msg,flags);
    }
    else if(msg.toString().toLowerCase().includes("$randomtweet") || msg.toString().toLowerCase().includes("$rtw")){
      
      let flags = getRandomFlags(msg);
      
      randomtweet.getTweet(msg,flags);
      
    }
  }
  catch(err){
    //send message that the command crashed
    msg.channel.send("https://c.tenor.com/YM3fW1y6f8MAAAAC/crying-cute.gif");
    msg.channel.send("I crashed! Owie! Let me know if you see this message! :3");
    console.log(err);
  }

  //get the flags for the random image command
  function getRandomFlags(msg){
      let flags: any = {};

      if(msg.toString().includes("-r") || msg.toString().includes("-refresh")){
        flags.refresh = true;
      }
      else if(msg.toString().includes("-sus") || msg.toString().includes("-s")){
        flags.sus = true;
      }
      
      return flags;
    }
  

  function getSauceFlags(msg)
  {
    let flags = {};
    let urlIndex = 0;
    for(let i = 1; msg.toString().split(" ")[i] !== undefined; ++i)
    {
      urlIndex = i;
      if(msg.toString().split(" ")[i].toLowerCase() === "-g")
        flags["-g"] = true;
    }
    return {urlIndex,flags};
  }  

  function getFindAnimeFlags(msg)
  {
    let flags = {};
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
    return {flags,urlIndex};
  }
}

