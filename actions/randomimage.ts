module.exports = {
    //finds a random sent message that exists in the channel
    getImage: function(msg){

        //send the message "finding your message now"
        msg.channel.send("finding your image now :3");


        
        fetchAllImages(msg);
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

        console.log("messages fetched");
        console.log(messages);

        let randomMessage = messages[Math.floor(Math.random() * messages.length)];

        let messageAuthor = randomMessage.author.username;

        msg.channel.send(messageAuthor + ': ' + randomMessage.attachments.first().url);    
    }
    catch(err){
      //send message that the command crashed
      msg.channel.send("https://c.tenor.com/YM3fW1y6f8MAAAAC/crying-cute.gif");
      msg.channel.send("I crashed! Owie! Let me know if you see this message! :3");
      console.log(err);
    }

  }