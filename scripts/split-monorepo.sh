#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/payrent-backend"
FRONTEND="$ROOT/payrent-frontend"
STAGING="$ROOT/.monorepo-staging"

echo "==> Staging current project..."
rm -rf "$STAGING"
mkdir -p "$STAGING"
shopt -s dotglob
for item in "$ROOT"/*; do
  base="$(basename "$item")"
  case "$base" in
    payrent-backend|payrent-frontend|.monorepo-staging|.git) continue ;;
  esac
  cp -a "$item" "$STAGING/"
done

echo "==> Creating payrent-backend..."
rm -rf "$BACKEND"
mkdir -p "$BACKEND"
cp -a "$STAGING/app" "$STAGING/lib" "$STAGING/prisma" "$STAGING/scripts" "$STAGING/__tests__" "$STAGING/types" "$BACKEND/"
cp -a "$STAGING/public" "$BACKEND/" 2>/dev/null || mkdir -p "$BACKEND/public"

# Backend: API routes only under app/
find "$BACKEND/app" -mindepth 1 -maxdepth 1 ! -name 'api' -exec rm -rf {} +
# Keep minimal root layout for Next.js API app
cat > "$BACKEND/app/layout.tsx" <<'EOF'
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
EOF

echo "==> Creating payrent-frontend..."
rm -rf "$FRONTEND"
mkdir -p "$FRONTEND"
cp -a "$STAGING/app" "$STAGING/components" "$STAGING/hooks" "$STAGING/stores" "$STAGING/public" "$STAGING/constants" "$STAGING/types" "$FRONTEND/"

# Frontend lib: copy only modules used by UI
mkdir -p "$FRONTEND/lib"
for dir in admin api auth business-rules constants messaging nav subscription utils validations; do
  if [ -d "$STAGING/lib/$dir" ]; then
    cp -a "$STAGING/lib/$dir" "$FRONTEND/lib/"
  fi
done
cp "$STAGING/lib/errors.ts" "$FRONTEND/lib/" 2>/dev/null || true
cp "$STAGING/lib/subscription-limits.ts" "$FRONTEND/lib/" 2>/dev/null || true
cp "$STAGING/lib/logger.ts" "$FRONTEND/lib/" 2>/dev/null || true

# Frontend: remove API routes except NextAuth session handler
rm -rf "$FRONTEND/app/api"
mkdir -p "$FRONTEND/app/api/auth"
cp -a "$STAGING/app/api/auth/[...nextauth]" "$FRONTEND/app/api/auth/"

# Copy config files to both apps
for f in tsconfig.json eslint.config.mjs postcss.config.mjs components.json vitest.config.ts proxy.ts; do
  [ -f "$STAGING/$f" ] && cp "$STAGING/$f" "$BACKEND/$f" && cp "$STAGING/$f" "$FRONTEND/$f"
done

cp "$STAGING/next.config.ts" "$BACKEND/next.config.ts"
cp "$STAGING/next.config.ts" "$FRONTEND/next.config.ts"

# Copy docs to root later; copy Dockerfile to backend
cp "$STAGING/Dockerfile" "$BACKEND/Dockerfile" 2>/dev/null || true

# Clean frontend lib of server-only modules
rm -rf "$FRONTEND/lib/api/handler.ts" 2>/dev/null || true

echo "==> Monorepo staging complete."
