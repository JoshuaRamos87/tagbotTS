module.exports = function (msg,lang,text)
{
    const translate = require('@iamtraction/google-translate');

    translate(text, { to: lang }).then(res => {
    msg.channel.send(res.text);
    }).catch(err => {
    msg.channel.send("translation error occured, double check the target language parameter :3");
    });
}
