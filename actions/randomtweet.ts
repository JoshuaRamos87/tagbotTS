module.exports = {
    //finds a random sent message that exists in the channel
    getTweet: function(context,flags){

        //check if directory exists
        if(require('fs').existsSync('./data/' + context.channel.id + '/tweets.json') && !flags.refresh){
            //if it does then read the file
            let messages = readFileTweet(context);

            //send the message
            sendRandomTweet(context,messages);
        }
        else{
            sendResponse(context, "finding your tweet now, this may take a while :3\nAfter this initial load it will be faster every time you use this command in this channel ;3");
            //if it doesn't then create the file
            fetchAllTweets(context);
        }
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

async function fetchAllTweets(context) {

    try{
        
        //get the channel id
        let channelID = context.channel.id;

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
                    //if the message includes twitter and not a bot
                    if(msg.content.includes("twitter.com") && !msg.author.bot){
                        //add the message to the array
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
        createFileTweet(context,messages);

        //read the file
        messages = readFileTweet(context);

        //send the message
        sendRandomTweet(context,messages);
    }
    catch(err){
      //send message that the command crashed
      sendResponse(context, "https://c.tenor.com/YM3fW1y6f8MAAAAC/crying-cute.gif\nI crashed! Owie! Let me know if you see this message! :3");
      console.log(err);
    }
}

function sendRandomTweet(context,messages){

    //get number of keys in the messages
    let numKeys = Object.keys(messages).length - 1;

    //get a random number between 0 and the length of the array
    let randomNumber = Math.floor(Math.random() * numKeys).toString();

    //send the message with author and image
    sendResponse(context, messages[randomNumber].author + ": " + messages[randomNumber].tweet);
}

function createFileTweet(context, messages){

    //create a new array size of messages array
    let newMessages = new Array(messages.length);

    //loop through the messages and add them to the new object
    for(let i = 0; i < messages.length; ++i){
        newMessages[i] = {
            "author": messages[i].author.username,
            "tweet": messages[i].content,
            "channelId": context.channel.id
        }
    }


    var rv = {};
    for (var i = 0; i < newMessages.length; ++i)
        rv[i] = newMessages[i];

    require('fs').mkdirSync(

        './data/' + context.channel.id,

        { recursive: true },

        function (err) {
            if (err) throw err;
            console.log('Directory created successfully!');
        }
    );

    require('fs').writeFileSync('data/' + context.channel.id + '/tweets.json', JSON.stringify(rv), 'utf8');
    
}

function readFileTweet(context){

    let messages = require('fs').readFileSync('data/' + context.channel.id + '/tweets.json', function (err) {
        console.log('complete');
    }).toString();

    Object.entries(JSON.parse(messages)).forEach( ([key, value]) => {
        messages[key] = value;
    } );

    return JSON.parse(messages);
}
