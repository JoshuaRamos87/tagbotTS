import translate from '@iamtraction/google-translate';

async function sendResponse(context, content) {
    if (context.reply) {
        if (context.deferred || context.replied) {
            return context.followUp(content);
        }
        return context.reply(content);
    }
    return context.channel.send(content);
}

export default function (context, lang, text)
{
    translate(text, { to: lang }).then(res => {
        sendResponse(context, res.text);
    }).catch(err => {
        sendResponse(context, "translation error occured, double check the target language parameter :3");
    });
}
