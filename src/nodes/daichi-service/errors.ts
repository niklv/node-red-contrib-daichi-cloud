/** The message of an error, whatever was actually thrown. */
export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** The value as an Error, so Node-RED's done callback always receives one. */
export const toError = (err: unknown) => (err instanceof Error ? err : new Error(errorMessage(err)))
