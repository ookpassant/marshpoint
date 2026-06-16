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

The Docker stack also runs **Mailpit**, a fake SMTP server that catches all
outgoing email so you can see invitations and confirmations during testing.
Open the inbox at `http://localhost:8025`.

## Email & deliverability

Marshpoint sends via SMTP (Nodemailer), configured entirely through the
`SMTP_*` environment variables — so you choose the transport per environment.

**Local/dev:** point `SMTP_HOST`/`SMTP_PORT` at Mailpit (the Docker stack does
this automatically) and read mail at `http://localhost:8025`.

**Production — staying out of spam.** Don't send directly from the VPS:
self-hosted IPs are usually on blocklists and lack a sending reputation. Instead
use a reputable transactional email provider (Brevo, Mailgun, Postmark, Amazon
SES, etc.) and point the `SMTP_*` variables at their relay. Then:

1. **Authenticate your domain** with all three DNS records — this is what stops
   mail going to spam:
   - **SPF** — a TXT record authorising the provider to send for your domain.
   - **DKIM** — the provider gives you keys/CNAMEs to publish; they cryptographically
     sign each message.
   - **DMARC** — a TXT record (`_dmarc.yourdomain`) tying it together and telling
     receivers what to do with failures (start at `p=none`, tighten later).
   Most providers walk you through these and verify them in their dashboard.
2. **Send from your own domain.** Set `EMAIL_FROM_ADDRESS` to an address on the
   domain you authenticated (e.g. `marshals@yourclub.org`), not a free
   `@gmail.com`/`@outlook.com` address — those fail DMARC alignment and get
   filtered. Keep `EMAIL_FROM_NAME` consistent.
3. **Use a real, monitored reply-to** and keep volume reasonable; the templates
   are plain text, which already helps.
4. **If you must self-host Postfix:** also set a matching reverse-DNS (PTR)
   record for the server IP, plus SPF/DKIM/DMARC — but a relay is strongly
   recommended.

Every send is recorded in the `comms_log` table (with the error on failure), so
delivery problems are visible in the Communications log.

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

## Data protection (UK GDPR)

Marshpoint includes the technical building blocks for UK GDPR / Data Protection
Act 2018 compliance. The legal/organisational parts (appointing a controller,
ICO registration if required, the privacy-notice wording, choosing a lawful
basis, and data-processing agreements with your email/host providers) remain the
club's responsibility.

- **Privacy notice & consent** — a `/privacy` page (template at
  `client/src/pages/Privacy.jsx` — fill in your details). Applicants must agree
  to it; each consent is stored against the application with a timestamp and the
  `PRIVACY_POLICY_VERSION`.
- **Right of access** — marshals can download everything held about them from
  their status page; coordinators can export a full per-marshal data pack
  (Marshals → a marshal → *Export data pack*).
- **Right to erasure** — coordinators can erase a marshal (anonymises the record
  and permanently deletes licence files, including superseded copies); marshals
  can request erasure from their status page. Erasure keeps the row anonymised so
  historical rosters stay intact.
- **Retention** — `npm run retention` (run on a daily cron/timer) anonymises
  marshals whose most recent event ended more than `RETENTION_DAYS` ago. Use
  `--dry-run` to preview.
- **Accountability** — exports, erasures, licence downloads, consents and purges
  are recorded in the `processing_log` table and shown per marshal in the admin UI.

## Key business rules

- A marshal cannot be **Confirmed** until their licence is uploaded *and*
  verified by a coordinator.
- Payment request emails are blocked until the event's shirts have been ordered.
- All schedule assignments start **provisional**; "Lock schedule" makes them
  final and notifies affected marshals.
- All personal data and licence files are stored only on the VPS — no
  third-party analytics, no CDN for uploads.
