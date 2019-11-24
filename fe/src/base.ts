import Action from "./model/Action";
import Upload from "./model/Upload";
import UploadResponse from "./model/UploadResponse";

export type Dispatch = {
    action(a: Action): Promise<void>
    upload(u: Upload): Promise<UploadResponse>
}