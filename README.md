This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

The Blog-Chat app was built with MERN stack and socket.io.

> **Rebuild in progress:** the description and screenshots below describe the legacy app currently live
> on `master`. A from-scratch Express + React (Vite) + TypeScript rebuild is under way on `staging` — see
> `CLAUDE.md` and `docs/superpowers/specs/2026-07-16-express-react-rebuild-design.md`. The quick start
> below is for the rebuild.

## Quick start

```bash
cp .env.example .env       # then fill in SESSION_SECRET
npm install
npm run dev                # docker compose watch — api, mongo, redis
npm run seed               # demo data + a demo account
```

The API is on http://localhost:3000/api/v1. There is no UI yet — that is P2.

## Try the authorization model with curl

```bash
# Anonymous: the premium post's body is a teaser. The full text is not in the
# response at all — the API never serialized it.
curl -s localhost:3000/api/v1/posts/gating-content-at-the-serialization-boundary

# Signed in: the full body.
curl -s -c jar -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":<username>,"password":<password>}'
curl -s -b jar localhost:3000/api/v1/posts/gating-content-at-the-serialization-boundary
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Full stack via `docker compose watch`, hot reload |
| `npm run seed` | Wipe and reseed the demo dataset |
| `npm run typecheck` | Per-workspace `tsc --noEmit` |
| `npm run lint` | ESLint (flat config) |
| `npm run test` | Vitest unit + Supertest integration |
| `npm run build` | tsup bundle for production |

### General
The app implements CRUD operations of users and posts in a server-client architecture. Those operations are based on HTTP requests between the server (Express server) and the client (which built with React.js).
In addition, There is a chat feature that based on WebSocket API implemented with Socket.io.

### Main Technologies:
- React.js + Hooks
- Redux
- React Bootstrap
- NPM
- Node.js
- Express.js
- MongoDB & Mongoose
- Socket.io
- JWT

### Screens:
#### Log-in:
![image](https://user-images.githubusercontent.com/57364867/151522312-c629b79b-a275-45ca-8b75-5dfaa086ce5c.png)

#### Sign-In:
![image](https://user-images.githubusercontent.com/57364867/151522360-3507b840-77cb-4185-bc38-3441f680b2b6.png)

#### Blog:
![image](https://user-images.githubusercontent.com/57364867/151522845-6525101e-f11c-48fc-bad8-7e3b8084ea66.png)

#### Chat:
![image](https://user-images.githubusercontent.com/57364867/151523003-5264d95c-d4cc-4106-9b51-7ce49bf3ca35.png)
