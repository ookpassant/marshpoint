# Marshpoint

> Marshal Event Management — marshpoint.co.uk

A self-hosted web application for managing motorsport event marshal signups.
Club- and event-agnostic: each event configures its own organising club, dates,
pricing, and an optional paid add-on, so any motor club can run any event with it.

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
npm run migrate              # apply database migrations
npm run seed                 # optional: load example data
npm run dev
```

The schema is managed as versioned migrations in `server/db/migrations/`.
`npm run migrate` applies any not yet recorded in the `schema_migrations`
table; add a new numbered `.sql` file there to evolve the schema.

The API listens on `http://localhost:3001`.

Run the backend tests:

```bash
npm test
```

This runs two kinds of test:

- **Unit tests** (no database) — the ORA auto-assignment algorithm, cost
  calculation, and CSV export.
- **Integration tests** — a full API lifecycle (login → invite → apply →
  verify → confirm → auto-assign → reports) against a dedicated test database.
  They skip automatically if no database is reachable. To run them, create the
  test database once:

  ```bash
  createdb -O marshalapp marshals_test    # or: CREATE DATABASE marshals_test;
  ```

  The suite reads the same `DB_*` credentials as the app and uses the database
  named by `TEST_DB_NAME` (default `marshals_test`); it applies the schema and
  resets all tables on each run.

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

## Run with Docker

The whole stack (PostgreSQL + API + Nginx-served frontend) runs with one
command. The server applies migrations on start.

```bash
docker compose up --build
```

Then open `http://localhost:8080`. Override the placeholder secrets
(`DB_PASSWORD`, `JWT_SECRET`, SMTP settings, …) with a `.env` file beside
`docker-compose.yml`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

- **Server** — `npm ci` then `npm test` (unit + integration) against a
  PostgreSQL 16 service container.
- **Client** — `npm ci` then a production `npm run build`.

## Production deployment (VPS / PM2)

For a non-Docker deployment, see the `nginx/marshal.conf` and
`server/ecosystem.config.js` files. In short:

```bash
cd /var/www/marshal-app
git pull
cd client && npm run build
cd ../server && npm install && npm run migrate
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
