import Action from "./model/Action0"
import { Upload, UploadResponse } from "./model/rpc"

export type Dispatch = {
    action(a: Action): Promise<void>
    upload(u: Upload): Promise<UploadResponse>
}