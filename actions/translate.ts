import translate from '@iamtraction/google-translate';
import { BotContext } from '../utils/types.js';
import { sendResponse, getUserId } from '../utils/response.js';
import { logError } from '../utils/database.js';

export default function (context: BotContext, lang: string, text: string)
{
    translate(text, { to: lang }).then(res => {
        sendResponse(context, res.text);
    }).catch(err => {
        console.error("[Translate Error]", err);
        logError(err, {
            method: 'translate',
            user_id: getUserId(context),
            guild_id: context.guildId || undefined,
            channel_id: context.channel?.id,
            additional_info: { lang, textLength: text.length }
        });
        sendResponse(context, "translation error occured, double check the target language parameter :3");
    });
}
