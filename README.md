# StudyMate – AI Study Assistant

Upload PDF → chat with it (streaming + sources) → summaries → quizzes.

## Run locally
```bash
docker compose up -d                 # PostgreSQL
cd server && cp .env.example .env    # fill JWT_SECRET + ANTHROPIC_API_KEY
npm install && npx prisma migrate dev --name init && npm run dev
# new terminal
cd client && npm install && npm run dev   # http://localhost:3000
```
## Stack
Next.js 14 · TypeScript · Tailwind · Express · Prisma · PostgreSQL · JWT (httpOnly cookie) · Claude API
