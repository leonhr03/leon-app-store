# ---- Stage 1: Angular frontend bauen ----
FROM node:22-alpine AS web
WORKDIR /web
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: Go-API bauen ----
FROM golang:1.25-alpine AS api
WORKDIR /src
COPY server/api/go.mod ./
RUN go mod download
COPY server/api/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/server .

# ---- Stage 3: schlankes Runtime-Image ----
FROM alpine:3.20
RUN adduser -D -u 10001 app && mkdir -p /data /app/web && chown -R app:app /data /app
USER app
WORKDIR /app
COPY --from=api /out/server /app/server
COPY --from=web /web/dist/leon-app-store/browser /app/web
ENV PORT=9999 \
    DATA_DIR=/data \
    WEB_DIR=/app/web
EXPOSE 9999
ENTRYPOINT ["/app/server"]
