type Config = {
    gcsBucket: string
}

export default function GetConfig(): Config {
    return {
        gcsBucket: 'pictophone-app-drawings',
    }
}
