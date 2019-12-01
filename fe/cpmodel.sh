
rm src/model/*

for f in Action Action0 Export Export0 Export1.0.0 rpc base; do
    cp ../be/src/model/$f.ts src/model/
done

for f in Export rpc; do
    cp ../be/src/model/$f.validator.ts src/model/
    sed -i "s/import Ajv = require('ajv');/import Ajv from 'ajv';/;/^export [{]/d" src/model/$f.validator.ts
done
