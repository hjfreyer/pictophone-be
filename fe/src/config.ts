export type Config = {
    backendAddr: string
    storageBucket: string
}

export default function Config(): Config {
    return {
        backendAddr: process.env.REACT_APP_BACKEND!,
        storageBucket: 'pictophone-app-drawings',
    }
}