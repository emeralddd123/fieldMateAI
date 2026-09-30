# VPS deployment

FieldMate's production stack runs PostgreSQL, the API, and the web application
on a private Docker network. Caddy is the only public service. It obtains and
renews the TLS certificate required for microphone access on mobile browsers.

## Before connecting the VPS

1. Choose a domain or subdomain, such as `demo.example.com`.
2. Create a DNS `A` record pointing that name to the VPS IPv4 address.
3. Allow inbound TCP ports `22`, `80`, and `443`, plus UDP `443`. Do not expose
   PostgreSQL port `5432` or API port `3000`.
4. Install Docker Engine with the Compose plugin on the VPS.
5. Clone the repository into a non-root deployment user's home directory.

## Configure and launch

```sh
cp .env.production.example .env.production
chmod 600 .env.production
# Edit every placeholder in .env.production.
./scripts/deploy-vps.sh
```

Use URL-safe letters and numbers for `POSTGRES_PASSWORD`; Compose embeds it in
the PostgreSQL connection URL. The deployment fails early if any required
credential is absent. The permanent AssemblyAI key stays in the API container
and is never built into the browser application.

The API container applies committed Prisma migrations before it starts. For the
hackathon demo, seed the initial Plant Alpha data once:

```sh
docker compose --env-file .env.production -f compose.production.yml \
  exec api pnpm prisma:seed
```

Do not run the reset seed command against data you need to retain.

## Verify the deployment

```sh
docker compose --env-file .env.production -f compose.production.yml ps
curl --fail --show-error https://YOUR_DOMAIN/health
```

Open `https://YOUR_DOMAIN` on the technician's phone, allow microphone access,
and start a voice session. Test this on the event network before presenting.

## Update and operate

```sh
git pull --ff-only
./scripts/backup-vps.sh
./scripts/deploy-vps.sh

# Follow application logs
docker compose --env-file .env.production -f compose.production.yml logs -f api web caddy
```

Backups are written under `backups/`, which Git ignores. Copy backups to a
second secured location; a file on the same VPS does not protect against VPS
loss. To stop the application without deleting data, run:

```sh
docker compose --env-file .env.production -f compose.production.yml down
```

Never add `-v` to that command on the VPS because it deletes the database and
Caddy certificate volumes.
