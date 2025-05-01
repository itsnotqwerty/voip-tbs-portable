FROM denoland/deno:latest

ARG GIT_REVISION
ENV DENO_DEPLOYMENT_ID=${GIT_REVISION}

WORKDIR /app

COPY . .

EXPOSE 8000

RUN deno task build

CMD ["run", "-A", "main.ts"]