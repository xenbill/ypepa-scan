# Σχεδιοθήκη (Sxedia)

Standalone web app that replaces the legacy VB WinForms drawing-scan archive.
It reads/writes the **existing Oracle tables** (`CCC.C16PE_SXEDIO`,
`CCC.C16PE_SXEDIO_BLOB` + lookups) unchanged, so all ~47,000 archived drawings
appear immediately — no migration.

## Structure

- `backend` — ASP.NET Core API + serves the built frontend from `wwwroot`
- `frontend` — React + TypeScript (Vite): `src/api` (fetch helpers + types),
  `src/pages`, `src/components`, `src/viewer` (OpenSeadragon viewer). TanStack Query for data fetching/caching,
  React Router (`/login`, `/`, `/sxedio/:id` — drawings are deep-linkable).
  `npm run build` type-checks and outputs into `backend/wwwroot`, so the
  deployable is still the single .NET app. Lightweight modern CSS (no animations),
  ES2015 output for older PCs; React and OpenSeadragon are bundled — no CDN needed.
  For frontend development: `npm run dev` (serves on :5173, proxies `/api` and
  `/tiles` to the .NET app on :5580).

## Login

Cookie-carried JWT: `POST /api/auth/login` validates the credentials, issues a
signed JWT and sets it as an **HttpOnly, SameSite=Lax** cookie (`sxedia_auth`,
8-hour expiry — `Jwt:ExpiresInMinutes`); the response body is `{expiresAt, user}`.
The SPA never sees the token — the browser sends the cookie automatically on
every same-origin request, so `/api/*` **and** `/tiles/*` (DZI tiles, thumbs,
cached PDFs, served by `Endpoints/TileEndpoints.cs`) all require login, and
`<img>`/PDF frames/OpenSeadragon just work. Unauthenticated requests get 401
(no redirect); `POST /api/auth/logout` expires the cookie. CSRF is covered by
SameSite=Lax + all mutations being non-GET; the `Secure` flag is set only when
the request is HTTPS, so plain intranet HTTP still works. The credential check
is **temporary** (`Auth:Username`/`Auth:Password` in appsettings, default
`dev`/`dev`) — swap `ValidateCredentials` in `Auth/JwtAuth.cs` for the real user
store later; the cookie/token plumbing stays. The logged-in username is
recorded as `USER_INS` on imports.

## Logging

Serilog (same pattern as meleti-manager: `SerilogInstaller` + config-driven
sinks). Console + rolling daily file at `logs/log-<date>.txt` **inside the app
folder**, next to `tile-cache/` and `demo-data/`; 30 files retained. Configure
under `Serilog` in appsettings.json.

## Μονάδα lookup

The Μονάδα filter/column resolves `C16PE_SXEDIO.HSTR_ID` against
`COMMON.G11HAF_STRUCTURE` (`HSTR_ID`/`TITLE`) — the CCC account has read access.
Schema owner configurable via `Oracle:CommonOwner`.

## Run (demo mode, no Oracle needed)

```powershell
cd backend
dotnet run --urls http://localhost:5580
```

First start generates four sample 10000×15000 bilevel TIFFs under
`backend/demo-data/` so the viewer can be exercised at realistic sizes.

## Switch to the real archive

In `backend/appsettings.json`:

```jsonc
"Storage": { "Mode": "Oracle" },
"Oracle": {
  "ConnectionString": "User Id=...;Password=...;Data Source=gea-prod01/<service>",
  "Owner": "CCC"
}
```

## How viewing works

- Browsers cannot render TIFF, and a 150-megapixel scan is far too large to
  serve as one image. On first view of a drawing, libvips (NetVips) builds a
  **Deep Zoom (DZI) tile pyramid** (~1–3 s) into `tile-cache/<id>/`; after that
  the drawing opens instantly and zooms like a map (OpenSeadragon, bundled
  from npm via Vite — no internet access needed at runtime).
- PDF blobs are detected by magic bytes and shown with the browser's native
  PDF viewer instead.
- `tile-cache/` is capped at **1 GB** (`Cache:MaxMegabytes`, default 1024): past the cap,
  the least-recently-viewed drawings are evicted automatically and regenerate
  on next view (~1–3 s). A 10000×15000 scan costs ~6–10 MB of tiles, so the
  default cap keeps roughly the last 100–150 viewed drawings instant. The folder
  can also be deleted manually at any time.

## Importing new drawings

"Καταχώριση σχεδίου" uploads TIFF/PDF/JPG + metadata and inserts into both
tables inside one transaction (BLOB is streamed). New material can come from
Microsoft Lens phone captures (PDF) or any scanner's scan-to-file output.

## Not done yet (candidates for next iteration)

- Bulk import (folder + CSV/Excel of metadata — the old `MAZIKI_KATAXWRISI` flow)
- Authentication (integration point: the Filippos user-management API)
- Editing/deleting existing records
- Verify the archive's TIFF/PDF mix with the magic-bytes SQL (see project notes)
