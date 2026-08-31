FROM cgr.dev/chainguard/python:latest-dev@sha256:f0f3f01288b7ae009d90828d2dbd2f3c949aa3b6e820081cb278880d758ffb44 AS build

WORKDIR /app

COPY requirements.lock .
RUN pip install --no-cache-dir --user --require-hashes -r requirements.lock

FROM cgr.dev/chainguard/python:latest@sha256:f487e51ca6ee4b20e07e1b4c9c44d3108ab305d2318b0f233f5b72529f52a6aa

WORKDIR /app

# LightGBM needs OpenMP; the minimal runtime already supplies libc, libstdc++,
# and libgcc but deliberately omits this one shared library.
COPY --from=build /usr/lib/libgomp.so.1 /usr/lib/libgomp.so.1
COPY --from=build /home/nonroot/.local /home/nonroot/.local

COPY --chown=65532:65532 . .

USER 65532:65532

EXPOSE 8001

ENTRYPOINT ["python", "-m", "src.container_entrypoint"]
