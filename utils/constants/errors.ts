/**
 * System-wide error messages.
 */
export const ERROR_GENERIC = "An unexpected error occurred while processing your request. The details have been logged.";

export const ERROR_TRANSLATION = "translation error occured, double check the target language parameter :3";
export const ERROR_ANIME_NOT_FOUND = "❌ No anime found for this image.";
export const ERROR_SAUCE_NOT_FOUND = "No good source found in the results :(";
export const ERROR_SAUCE_IQDB_FAILED = "IQDB is currently having trouble processing this image. This often happens if the image is too large, in an unsupported format, or if their server is overloaded. Please try again later or with a different image.";
export const ERROR_GAC_NOT_FOUND = (tagQuery: string) => `❌ No images found for tags: \`${tagQuery}\``;
export const ERROR_DICTIONARY_NOT_FOUND = (cleanedWord: string) => `No definitions found for **${cleanedWord}**`;
