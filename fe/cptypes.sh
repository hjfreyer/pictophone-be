
for f in Action Action0 Export Export0 Upload UploadResponse base; do
    cp ../be/src/model/$f.ts src/model/
done

for f in Export Upload UploadResponse; do
    cp ../be/src/model/$f.validator.ts src/model/
    sed -i "s/import Ajv = require('ajv');/import Ajv from 'ajv';/;/^export [{]/d" src/model/$f.validator.ts
done
