# syntax=docker/dockerfile:1

# ===== base =====
FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ===== deps (ติดตั้งทั้ง dependencies + devDependencies เพื่อใช้ build + drizzle-kit/tsx ตอน start) =====
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ===== build =====
FROM base AS build
# basePath ถูก bake ตอน `next build` — รับผ่าน build arg (ค่าว่าง = เสิร์ฟที่ root)
# compose ส่ง BASE_PATH=/arena มาให้ตอน build บน prod (ดู docker-compose.yml)
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH
# ค่า placeholder เฉพาะตอน build — src/lib/env.ts ตรวจ env ตอน collect page data
# (ค่าจริงถูกกำหนดตอน runtime ผ่าน docker compose / .env; stage นี้ไม่หลุดไปถึง image สุดท้าย)
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV JWT_SECRET=build-time-placeholder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ===== runtime =====
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3017
# `next start` อ่าน next.config.ts ซ้ำตอน runtime — ต้องได้ค่า BASE_PATH เดียวกับตอน build
# ไม่งั้น config ไม่ตรงกับ .next ที่ bake ไว้แล้ว routing จะเพี้ยน (ARG เป็นของแต่ละ stage ต้องประกาศใหม่)
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH

# node_modules ยังคง devDeps ไว้ เพราะ entrypoint ต้องใช้ drizzle-kit (push) + tsx (seed)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# ไม่รันเป็น root — ไฟล์ที่ COPY มาเป็นของ root (อ่านได้พอ) ยกเว้น .next ที่ next start
# ต้องเขียน cache ได้ จึง chown เฉพาะโฟลเดอร์นั้น (user "node" มากับ base image อยู่แล้ว)
RUN chown -R node:node /app/.next
# โฟลเดอร์ไฟล์สำรองบนเซิร์ฟเวอร์ (หน้า “สำรอง & กู้คืนข้อมูล”) — ต้องมีใน image และเป็นของ node
# เพราะ named volume ที่ mount ครั้งแรกจะ copy ownership จากตรงนี้ (ไม่งั้น node เขียนไม่ได้)
RUN mkdir -p /app/backups && chown node:node /app/backups
USER node

EXPOSE 3017
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
