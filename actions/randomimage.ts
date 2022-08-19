module.exports = {
    //finds a random sent message that exists in the channel
    getImage: function(msg,flags){


        //if statement for memes not neccessary at all should be removed in the future lol
        //searches a json for a specific channel id that is full of sus images
        if(flags.sus){

            //if directory doesn't exist send message that directory doesn't exist
            if(!require('fs').existsSync('./data/1010205484554391552/images.json')){
                msg.channel.send("Nice Try");
                return;
            }

            let messages = require('fs').readFileSync('./data/1010205484554391552/images.json').toString();
            Object.entries(JSON.parse(messages)).forEach( ([key, value]) => {
                messages[key] = value;
            } );
            messages = JSON.parse(messages);
            sendRandomMessage(msg,messages);
            return;
        }

        //check if directory exists
        if(require('fs').existsSync('./data/' + msg.channel.id) && !flags.refresh){
            //if it does then read the file
            let messages = readFile(msg);

            //console.log("messages read");
            //console.log(messages);

            //send the message
            sendRandomMessage(msg,messages);
        }
        else{
            msg.channel.send("finding your image now, this may take a while :3");
            msg.channel.send("After this initial load it will be faster every time you use this command in this channel ;3");
            //if it doesn't then create the file
            fetchAllImages(msg);
        }



        
        
    }

    
}

async function fetchAllImages(msg) {

    try{
        
        //get the channel id
        let channelID = msg.channel.id;

        //get client from the message
        let client = msg.client;

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

        //console.log("messages fetched");
        //console.log(messages);   

        //create the file if it doesn't exist
        createFile(msg,messages);

        //read the file
        messages = readFile(msg);

        //send the message
        sendRandomMessage(msg,messages);
    }
    catch(err){
      //send message that the command crashed
      msg.channel.send("https://c.tenor.com/YM3fW1y6f8MAAAAC/crying-cute.gif");
      msg.channel.send("I crashed! Owie! Let me know if you see this message! :3");
      console.log(err);
    }
}

function sendRandomMessage(msg,messages){

     //console.log("messages read");
    //console.log(messages);

    //get number of keys in the messages
    let numKeys = Object.keys(messages).length - 1;
    //console.log(numKeys);

    //get a random number between 0 and the length of the array
    let randomNumber = Math.floor(Math.random() * numKeys).toString();

    //send the message with author and image
    msg.channel.send(messages[randomNumber].author + ": " + messages[randomNumber].image);
}

function createFile(msg, messages){

    //create a new array size of messages array
    let newMessages = new Array(messages.length);

    //console.log(messages[0].attachments);
    //console.log(msg.author.username);
    
    //loop through the messages and add them to the new object
    for(let i = 0; i < messages.length; ++i){
        newMessages[i] = {
            "author": messages[i].author.username,
            "image": messages[i].attachments.first().url,
            "channelId": msg.channel.id
        }
    }


    var rv = {};
    for (var i = 0; i < newMessages.length; ++i)
        rv[i] = newMessages[i];

    require('fs').mkdirSync(

        './data/' + newMessages[0].channelId,

        { recursive: true },

        function (err) {
            if (err) throw err;
            console.log('Directory created successfully!');
            // require('fs').writeFileSync('data/' + newMessages[0].channelId + '/images.json', JSON.stringify(rv), function (err) {
            //     console.log('complete');
            //     //close the file
            //     fs.closeSync();
            // });
        }
    );

    require('fs').writeFileSync('data/' + newMessages[0].channelId + '/images.json', JSON.stringify(rv), 'utf8');
    
}

function readFile(msg){

    let messages = require('fs').readFileSync('data/' + msg.channel.id + '/images.json', function (err) {
        console.log('complete');
    }).toString();

    Object.entries(JSON.parse(messages)).forEach( ([key, value]) => {
        messages[key] = value;
    } );

    return JSON.parse(messages);
}
