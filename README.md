# tagbotTS
Simple discord bot that will give you definitions or synonyms of words based on input commands. Uses the free dictionary api you can find [here](https://dictionaryapi.dev/).<br />
Other functionality includes:<br />
Finding anime source by providing a URL of a screenshot from an anime. Uses this [npm module](https://www.npmjs.com/package/iqdb-client)<br />
Finding the source of anime artwork by providing a URL of the anime artwork. Uses this [API](https://soruly.github.io/trace.moe-api/#/docs) <br />
Translating from one language to another. Uses this [npm module](https://www.npmjs.com/package/@iamtraction/google-translate) <br />
Finding a random image in the channel you are currently in. 
<br />


Use the $help for ways to trigger these actions.


## How to get started

The following are instructions to get the program running

### Requirements:

Latest version of Node.js was used for this, v16.13.0
Get it [here](https://nodejs.org/en/) <br />
Requires getting your own discord api key and storing it as an environment variable in a .env file, register [here](https://discord.com/developers/applications)<br/>
IMPORTANT .env file needs to be with in the build folder, this is not done automatically yet...

## Installation of dependencies

```
npm install
```

## Example of running program

```
npm run start-win for windows
npm run start-linux for linux
```

## Author
Joshua Ramos