#!/bin/bash -e
#
# From template: https://gist.github.com/waylan/4080362

ProgName=$(basename $0)

sub_help(){
    echo "Usage: $ProgName <subcommand> [options]\n"
    echo "Subcommands:"
    echo "    build"
    echo "    deploy"
    echo ""
    echo "For help with each subcommand run:"
    echo "$ProgName <subcommand> -h|--help"
    echo ""
}

sub_build() {
    gcloud builds submit --tag gcr.io/pictophone-app/pictophone-be
}

sub_deploy() {
    gcloud beta run deploy \
        pictophone-be \
        --region us-east1 \
        --image gcr.io/pictophone-app/pictophone-be \
        --platform managed \
        --allow-unauthenticated \
        --service-account=pictophone-api-prod@pictophone-app.iam.gserviceaccount.com
}

subcommand=$1
case $subcommand in
    "" | "-h" | "--help")
        sub_help
        ;;
    *)
        shift
        sub_${subcommand} $@
        if [ $? = 127 ]; then
            echo "Error: '$subcommand' is not a known subcommand." >&2
            echo "       Run '$ProgName --help' for a list of known subcommands." >&2
            exit 1
        fi
        ;;
esac


