import Action from "./model/Action"
import { Upload, UploadResponse } from "./model/rpc"

export type Dispatch = {
    action(a: Action): Promise<void>
    upload(u: Upload): Promise<UploadResponse>
}

export const MODEL_VERSION = 'v1.2.0'