
async function sendResponse(context, content) {
    if (context.reply) {
        if (context.deferred || context.replied) {
            return context.followUp(content);
        }
        return context.reply(content);
    }
    return context.channel.send(content);
}

module.exports = function (context, lang, text)
{
    const translate = require('@iamtraction/google-translate');

    translate(text, { to: lang }).then(res => {
        sendResponse(context, res.text);
    }).catch(err => {
        sendResponse(context, "translation error occured, double check the target language parameter :3");
    });
}
