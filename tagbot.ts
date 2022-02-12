require("dotenv").config();
//TODO: Find a way to move this into the build folder
const mySecret = process.env.TOKEN
const Discord = require("discord.js");
const client = new Discord.Client({intents: ["GUILDS", "GUILD_MESSAGES"]});
const command = require('./command');

console.log('hello')

client.login(mySecret);

client.on("ready", () => {
  console.log(`Logged in as
  ${client.user.tag}!`)
});

client.on("message", msg => { 
    if(msg.author.bot) return;
    command(msg);
});