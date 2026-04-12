import translate from '@iamtraction/google-translate';
import { BotContext } from '../utils/types.js';
import { sendResponse } from '../utils/response.js';

export default function (context: BotContext, lang: string, text: string)
{
    translate(text, { to: lang }).then(res => {
        sendResponse(context, res.text);
    }).catch(err => {
        sendResponse(context, "translation error occured, double check the target language parameter :3");
    });
}
