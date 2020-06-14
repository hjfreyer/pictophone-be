#!/bin/bash 

set -x

for f in $(find src/model/ -type f|grep -v "validator\|index"); do
    typescript-json-validator --collection "${f}"
    sed -i "/^export [{]/d" "${f%.*}.validator.ts"
    tsfmt -r "${f%.*}.validator.ts"
done