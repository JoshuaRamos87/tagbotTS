import fs from 'fs';

export function getImage(context,flags){

    let channelID = context.channel.id;

    //if the message is in a thread then get the parent message
    if(context.channel.isThread()){
        channelID = context.channel.parentId;
    }


    //if statement for memes not neccessary at all should be removed in the future lol
    //searches a json for a specific channel id that is full of sus images
    if(flags.sus){

        //if directory doesn't exist send message that directory doesn't exist
        if(!fs.existsSync('./data/1010205484554391552/images.json')){
            sendResponse(context, "Nice Try");
            return;
        }

        let messages = fs.readFileSync('./data/1010205484554391552/images.json').toString();
        Object.entries(JSON.parse(messages)).forEach( ([key, value]) => {
            messages[key] = value;
        } );
        messages = JSON.parse(messages);
        sendRandomMessage(context,messages);
        return;
    }

    //check if directory exists
    if(fs.existsSync('./data/' + channelID + '/images.json') && !flags.refresh){
        //if it does then read the file
        let messages = readFile(context,channelID);

        //send the message
        sendRandomMessage(context,messages);
    }
    else{
        sendResponse(context, "finding your image now, this may take a while :3\nAfter this initial load it will be faster every time you use this command in this channel ;3");
        //if it doesn't then create the file
        fetchAllImages(context,channelID);
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

async function fetchAllImages(context,channelID) {

    try{

        //get client from the message
        let client = context.client;

        const channel = client.channels.cache.get(channelID);
        let messages = [];
    
        // Create message pointer
        let message = await channel.messages
        .fetch({ limit: 1 })
        .then(messagePage => (messagePage.size === 1 ? messagePage.at(0) : null));
    
        while (message) {
        await channel.messages
            .fetch({ limit: 100, before: message.id })
            .then(messagePage => {

            messagePage.forEach(msg => {
                    if(msg.attachments.size > 0){
                        messages.push(msg);
                    }
                    else return;
                });
    
            // Update our message pointer to be last message in page of messages
            message = 0 < messagePage.size ? messagePage.at(messagePage.size - 1) : null;
            }
            );
        }

        //create the file if it doesn't exist
        createFile(context,messages,channelID);

        //read the file
        messages = readFile(context,channelID);

        //send the message
        sendRandomMessage(context,messages);
    }
    catch(err){
      //send message that the command crashed
      sendResponse(context, "https://c.tenor.com/YM3fW1y6f8MAAAAC/crying-cute.gif\nI crashed! Owie! Let me know if you see this message! :3");
      console.log(err);
    }
}

function sendRandomMessage(context,messages){

    //get number of keys in the messages
    let numKeys = Object.keys(messages).length - 1;

    //get a random number between 0 and the length of the array
    let randomNumber = Math.floor(Math.random() * numKeys).toString();

    //send the message with author and image
    sendResponse(context, messages[randomNumber].author + ": " + messages[randomNumber].image);
}

function createFile(context, messages, channelID){

    console.log("creating file" + messages);

    //create a new array size of messages array
    let newMessages = new Array(messages.length);

    //loop through the messages and add them to the new object
    for(let i = 0; i < messages.length; ++i){
        newMessages[i] = {
            "author": messages[i].author.username,
            "image": messages[i].attachments.first().url,
            "channelId": channelID
        }
    }


    var rv = {};
    for (var i = 0; i < newMessages.length; ++i)
        rv[i] = newMessages[i];

    fs.mkdirSync(

        './data/' + channelID,

        { recursive: true }
    );

    fs.writeFileSync('data/' + channelID + '/images.json', JSON.stringify(rv), 'utf8');
    
}

function readFile(context,channelID){

    let messages = fs.readFileSync('data/' + channelID + '/images.json').toString();

    Object.entries(JSON.parse(messages)).forEach( ([key, value]) => {
        messages[key] = value;
    } );

    return JSON.parse(messages);
}
