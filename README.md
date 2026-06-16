# Marshpoint

> Marshal Event Management — marshpoint.co.uk

A self-hosted web application for managing motorsport event marshal signups.
Built for the Welbeck & District Motor Club (WDMC) marshalling team at the
Goodwood Festival of Speed (GFoS).

## What it does

- **Marshal portal** — marshals receive a unique invite link, complete an
  online application form, upload their MSUK licence, and track their own status.
- **Coordinator dashboard** — manage the full lifecycle: invitations,
  applications, licence verification, team assignment, scheduling, comms and
  payment tracking.
- **Committee view** — read-only overview of numbers, financials and rosters.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + React Router v6 + Axios |
| Backend | Node.js 20 + Express.js |
| Database | PostgreSQL 16 |
| Auth | JWT + bcrypt |
| File storage | Local filesystem (`/var/marshal-uploads/`) |
| Email | Nodemailer via SMTP |
| Process management | PM2 |
| Web server | Nginx (reverse proxy + static serving) |

## Repository layout

```
client/   React frontend
server/   Express backend
nginx/    Nginx site config
```

## Local development

### Prerequisites

- Node.js 20+
- PostgreSQL 16

### Backend

```bash
cd server
cp ../.env.example .env      # edit values
npm install
psql -U marshalapp -d marshals -f db/schema.sql
npm run seed                 # optional: load example data
npm run dev
```

The API listens on `http://localhost:3001`.

### Frontend

```bash
cd client
npm install
npm start
```

The dev server runs on `http://localhost:3000` and proxies `/api` to the
backend.

## Default seed login

After running `npm run seed`:

- **Coordinator:** `jon@marshpoint.co.uk` / `changeme123`
- **Committee:** `committee@marshpoint.co.uk` / `changeme123`

Change these immediately in any real deployment.

## Production deployment

See the build & deployment steps in the project specification and the
`nginx/marshal.conf` and `server/ecosystem.config.js` files. In short:

```bash
cd /var/www/marshal-app
git pull
cd client && npm run build
cd ../server && npm install
pm2 restart marshal-app
```

## Key business rules

- A marshal cannot be **Confirmed** until their licence is uploaded *and*
  verified by a coordinator.
- Payment request emails are blocked until the event's shirts have been ordered.
- All schedule assignments start **provisional**; "Lock schedule" makes them
  final and notifies affected marshals.
- All personal data and licence files are stored only on the VPS — no
  third-party analytics, no CDN for uploads.
