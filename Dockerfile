FROM node:20-alpine AS frontend-builder

WORKDIR /app/ui

COPY ui/package.json ui/pnpm-lock.yaml ./

RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

COPY ui/ ./
# This builds to ../static
RUN pnpm run build

# ==========================================
# BACKEND BUILDER
# ==========================================
FROM golang:1.24-alpine AS backend-builder

WORKDIR /app

COPY go.mod ./
COPY go.sum ./

RUN go mod download

COPY . .

# Copy frontend assets to backend builder
# CRITICAL: This allows //go:embed static to find the files during build
COPY --from=frontend-builder /app/static ./static

# Build the binary
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o kite .

# Create logs dir
RUN mkdir -p logs

# ==========================================
# FINAL STAGE
# ==========================================
FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata bash curl

# 1. Copy Binary
COPY --from=backend-builder /app/kite .

# 2. Copy Logs
COPY --from=backend-builder /app/logs ./logs

# 3. Copy Static Files (Useful for debugging, though the binary now embeds them)
COPY --from=backend-builder /app/static ./static

# Permissions
RUN chmod 777 logs
RUN chmod -R 755 static

EXPOSE 8080

CMD ["./kite"]