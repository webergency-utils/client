#!/bin/bash -eu

npm ci
npm run build

compile_javascript_fuzzer client fuzz_client.cjs
