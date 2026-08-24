FROM cgr.dev/chainguard/python:latest-dev@sha256:3175d3562cd6fbdf92c574a5f937bbb5a78f04da130d76dead3a5628b1383f80 AS build

WORKDIR /app

COPY requirements.lock .
RUN pip install --no-cache-dir --user --require-hashes -r requirements.lock

FROM cgr.dev/chainguard/python:latest@sha256:d812438658b47b73cb4c089f4cca09bca1ba50f6cd1843133864ee074d9ec49b

WORKDIR /app

# LightGBM needs OpenMP; the minimal runtime already supplies libc, libstdc++,
# and libgcc but deliberately omits this one shared library.
COPY --from=build /usr/lib/libgomp.so.1 /usr/lib/libgomp.so.1
COPY --from=build /home/nonroot/.local /home/nonroot/.local

COPY --chown=65532:65532 . .

USER 65532:65532

EXPOSE 8001

ENTRYPOINT ["python", "-m", "src.container_entrypoint"]
