# ==========================================
# STAGE 1: Dependency Installer
# ==========================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy lockfiles to fetch precise cached layers
COPY package.json package-lock.json* ./
RUN npm ci

# ==========================================
# STAGE 2: Application Builder
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data by default. Disable it here:
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ==========================================
# STAGE 3: Production Runner Image
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a secure, non-privileged system user to execute the binaries
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy essential runtime bundles from the compiler stages
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src

# Create a shared space for the SQLite database file and set permissions
RUN touch tilburg_decisions.db && chown nextjs:nodejs tilburg_decisions.db

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the web server framework
CMD ["npm", "run", "start"]