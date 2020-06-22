#!/bin/bash 

set -x

genFile () {
    local f=$1
    typescript-json-validator --collection "${f}"
    sed -i "/^export [{]/d" "${f%.*}.validator.ts"
    tsfmt -r "${f%.*}.validator.ts"
}

for f in $(find src/model/ -type f|grep -v "validator"); do
    genFile $f &
done
wait