export type Config = {
    backendAddr: string
}

export default function Config(): Config {
    return {
        backendAddr: process.env.REACT_APP_BACKEND!
    }
}