export const formatError = (error: unknown): string => {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    return 'An unknown error occurred'
}

export const validateJSON = (str: string): boolean => {
    try {
        JSON.parse(str)
        return true
    } catch {
        return false
    }
}