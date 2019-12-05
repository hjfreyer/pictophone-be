

MODEL_VERSION=1_2_0

rm src/model/*

cp ../be/src/model/rpc.ts src/model/
for f in Action Export; do
    cp "../be/src/model/${f}${MODEL_VERSION}.ts" "src/model/${f}.ts"
    sed -i "s/${f}${MODEL_VERSION}/${f}/" "src/model/${f}.ts"
done

typescript-json-validator src/model/Export.ts
typescript-json-validator --collection src/model/rpc.ts

for f in Export rpc; do
    sed -i "s/import Ajv = require('ajv');/import Ajv from 'ajv';/;/^export [{]/d" src/model/$f.validator.ts
done
