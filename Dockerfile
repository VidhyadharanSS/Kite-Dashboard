FROM node:20-alpine AS frontend-builder

WORKDIR /app/ui

COPY ui/package.json ui/pnpm-lock.yaml ./

RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

COPY ui/ ./
RUN pnpm run build

FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

COPY go.mod ./
COPY go.sum ./

RUN go mod download

COPY . .

# Copy frontend assets
COPY --from=frontend-builder /app/static ./static

# Build the binary
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o kite .

# Create logs dir
RUN mkdir -p logs

FROM alpine:3.20

WORKDIR /app

# Install bash/curl for debugging
RUN apk add --no-cache ca-certificates tzdata bash curl

COPY --from=backend-builder /app/kite .
COPY --from=backend-builder /app/logs ./logs

# Ensure permissions on the directory
RUN chmod 777 logs

EXPOSE 8080

CMD ["./kite"]