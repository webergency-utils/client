FROM gcr.io/oss-fuzz-base/base-builder-javascript
COPY . $SRC/client
WORKDIR $SRC/client
COPY .clusterfuzzlite/build.sh $SRC/build.sh
