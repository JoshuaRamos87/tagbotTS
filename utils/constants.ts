export const BASIC_ERRORS = [
    "An unexpected error occurred, but we're working on it.",
    "Something went wrong while processing your request.",
    "The bot encountered an error. Please try again later.",
    "A technical issue occurred. The details have been logged.",
    "Command failed due to an internal exception.",
    "The request could not be completed at this time."
];

export function getBasicError() {
    return BASIC_ERRORS[Math.floor(Math.random() * BASIC_ERRORS.length)];
}
