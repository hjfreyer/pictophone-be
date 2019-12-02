
ACTION_VERSION=0
EXPORT_VERSION=1_1_0

rm src/model/*

for f in "Action${ACTION_VERSION}" "Export${EXPORT_VERSION}" rpc; do
    cp ../be/src/model/$f.ts src/model/
done

typescript-json-validator "src/model/Export${EXPORT_VERSION}.ts"
typescript-json-validator --collection src/model/rpc.ts

for f in "Export${EXPORT_VERSION}" rpc; do
    sed -i "s/import Ajv = require('ajv');/import Ajv from 'ajv';/;/^export [{]/d" src/model/$f.validator.ts
done
