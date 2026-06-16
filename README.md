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

Run the backend unit tests (no database required — they cover the ORA
auto-assignment algorithm, cost calculation, and CSV export):

```bash
npm test
```

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

## Coordinator dashboard

Once signed in, coordinators get a full lifecycle toolkit:

- **Events** — create/edit events, ORA + stage config, shirt/barbie pricing,
  BACS details, and the `shirts ordered` toggle that unlocks payment requests
- **Invitations** — bulk-add invitees (plain email or `Name <email>`), send
  personal apply links, copy links, remind non-responders, revoke
- **Applications** — filterable/sortable table, slide-over detail with licence
  verification, confirm, payment, and per-marshal email; bulk actions; CSV export
- **Marshals** — the people directory that persists across events, with notes,
  ORA-experience flag, and per-marshal event history
- **Schedule** — editable grid, ORA Team A/B auto-assign (preview + commit),
  lock-and-notify, daily roster view, CSV export
- **Communications** — templated and custom emails to recipient groups, plus a
  full send log
- **Payments** and **Reports** (shirt order, barbie count, financials, daily roster)

Committee members see a read-only subset (dashboard, applications, payments,
reports, and a dedicated committee overview).

Marshals who can't attend can decline in one click from their apply page, which
notifies the coordinator and marks the invitation declined.

## Key business rules

- A marshal cannot be **Confirmed** until their licence is uploaded *and*
  verified by a coordinator.
- Payment request emails are blocked until the event's shirts have been ordered.
- All schedule assignments start **provisional**; "Lock schedule" makes them
  final and notifies affected marshals.
- All personal data and licence files are stored only on the VPS — no
  third-party analytics, no CDN for uploads.
