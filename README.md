# Σχεδιοθήκη ΥΠΕΠΑ (Mis.YpepaScan.Web)

Standalone web app that replaces the legacy VB WinForms drawing-scan archive.
It reads/writes the **existing Oracle tables** (`CCC.C16PE_SXEDIO`,
`CCC.C16PE_SXEDIO_BLOB` + lookups) unchanged, so all ~47,000 archived drawings
appear immediately — no migration.

Project/assembly: `Mis.YpepaScan.Web` (namespaces `Mis.YpepaScan.Web.*`),
solution `Mis.YpepaScan.slnx`. Deployed DLL: `Mis.YpepaScan.Web.dll` (see
`backend/web.config` for IIS).

## Structure

- `backend` — ASP.NET Core (.NET 10) minimal API + serves the built frontend
  from `wwwroot`. `Auth/` (JWT + login backends), `Data/` (Oracle/Demo stores,
  DTOs), `Endpoints/` (drawings, lookups, tiles), `Imaging/` (libvips tiling,
  file-type sniffing), `Utils/` (Serilog).
- `frontend` — React + TypeScript (Vite): `src/api` (fetch helpers + types),
  `src/pages`, `src/components`, `src/viewer` (OpenSeadragon viewer). TanStack
  Query for data fetching/caching, React Router. `npm run build` type-checks
  and outputs into `backend/wwwroot`, so the deployable is still the single
  .NET app (`dotnet publish` runs the frontend build automatically).
  Lightweight modern CSS (no animations), ES2015 output for older PCs; React
  and OpenSeadragon are bundled — no CDN needed. For frontend development:
  `npm run dev` (serves on :5173, proxies `/api` and `/tiles` to the .NET app
  on :5580).

## Pages / routes

| Route | What |
|---|---|
| `/login` | Login (username = ΑΜΑ, password, κατηγορία προσωπικού when the MIS backend is active) |
| `/` | Home: counts per category / type / unit — each row links to the filtered list |
| `/drawings` | Drawing list: filters, sort, page, page size (10/20/50/100, remembered) all live in the URL so Back/close return to the same list |
| `/drawings/:id` | Viewer (deep-linkable) with metadata sidebar, edit/delete, download |
| `/lookups` | Maintain lookup tables (categories, types, …) — `ADMIN` right only |
| `/manual` | In-app user manual (Οδηγίες): tabs per area (Γενικά, Αναζήτηση & λίστα, Προβολή/Επεξεργασία, Καταχώριση incl. supported file types, Μαζική καταχώριση, Λίστες επιλογών) with screenshots, plus «Έκδοση & αλλαγές» (version + changelog). `?tab=version` deep-links a tab. «Εκτύπωση / PDF» renders all tabs in one column and opens the browser print dialog (print stylesheet; save as PDF from there) |
| `/change-password` | Change password (MIS service or dev store) |
| `*` | Proper 404 / error pages |

App bar: ΥΠΕΠΑ emblem (also the favicon), brand links home (tooltip shows the
version), nav Αρχική / Σχέδια / Λίστες επιλογών (ADMIN only) / Οδηγίες, user
dropdown (avatar initials = surname + first name, full MIS display name clipped
with an ellipsis) with the user's rights (✓ / dimmed, see «Application rights»),
«Εμφάνιση» theme switch (Αυτόματο = follow the OS via `prefers-color-scheme`,
Φωτεινό, Σκοτεινό; stored in `localStorage` `ypepascan.theme`, applied as
`<html data-theme>` by `src/theme.ts` and an inline script in `index.html` so
there's no flash; `index.css` switches only CSS variables under
`[data-theme="dark"]`, the app bar stays blueprint blue, the viewer is dark in
both; print forces light), «Μέγεθος γραμμάτων» (Κανονικό / Μεγάλο / Πολύ
μεγάλο: `localStorage` `ypepascan.fontSize` → `<html data-size>` → CSS `zoom`
1.1 / 1.2 on the app bar, page content and viewer side panel — not the drawing
canvas or the login page; browsers without CSS zoom ignore it), change password
/ logout / version (→ changelog).

## API

All under `/api` and `/tiles` require login.

- `GET /api/auth/mode`, `POST /api/auth/login`, `GET /api/auth/me`,
  `POST /api/auth/logout`, `POST /api/auth/change-password`
- `GET /api/stats`, `GET /api/drawings` (filters/sort/paging),
  `GET /api/drawings/{id}`, `GET /api/drawings/{id}/view` (tile info),
  `GET /api/drawings/{id}/file` (download), `POST /api/drawings` (import),
  `PUT /api/drawings/{id}` (edit metadata), `DELETE /api/drawings/{id}`
- `GET /api/lookups`, `POST/PUT/DELETE /api/lookups/{type}[/{id}]`
- `GET /tiles/{**path}` — DZI tiles / thumbnails

## Login

Two credential backends, selected at startup by `Auth:DevLogin`:

- **`false` (production)** — `MisAuthBackend`: the MIS **LGNWS** SOAP login
  service (`Auth:LoginService` — `Address`, `AppDbCode=SCAN_YPEPA`, service
  credentials). Username is the ΑΜΑ; the login page shows the κατηγορίες
  προσωπικού dropdown fetched from the service; the chosen category is
  carried in the JWT. Password change goes through the same service.
- **`true` (dev)** — `DevAuthBackend`: single user `Auth:Username`/`Auth:Password`
  (default `dev`/`dev`); after a change-password the SHA-256 hash in `auth.json`
  takes precedence. Its rights come from `Auth:Rights` (see below).

### Application rights

The five rights of the legacy WinForms app (MIS login DB, APPLIC_ID 83) are
kept as-is — they are not managed in this app.
The login service returns them per user as `APP_RIGHTS` (`APP_RIGHT` name /
`APP_FUNCTION_ID`); `Auth/AppRights.cs` maps them, puts them in the JWT as
`right` claims, and registers one authorization policy per right (a policy
passes with that right **or** `ADMIN`). `GET /api/auth/me` returns
`user.rights` (ADMIN is expanded to all five) so the SPA hides what the user
cannot do and lists them (✓ / dimmed) in the user menu; the server enforces them anyway (403 → «Δεν έχετε δικαίωμα για αυτή
την ενέργεια»).

| Right (legacy id) | Legacy description | Gates in the web app |
|---|---|---|
| `VIEW` (2674) | Προβολή Σχεδίων | Baseline: required to log in at all (otherwise «Δεν έχετε δικαίωμα πρόσβασης…»); search, list, view, inline PDF, tiles |
| `SCAN` (2676) | Σάρωση Σχεδίων | `POST /api/drawings` — Καταχώριση / Μαζική καταχώριση (buttons on the list page and the home page, `?import=` modals) |
| `PRINT` (2677) | Εκτύπωση Σχεδίων | `GET /api/drawings/{id}/file` as attachment — «Λήψη πρωτοτύπου» (`?inline=true`, the viewer's PDF frame, is viewing). Without it the PDF iframe gets `#toolbar=0` so Chrome/Edge hide their download/print buttons (UI only; Firefox ignores it) |
| `EDIT_SCANNED_SXEDIO` (2678) | Επεξεργασία Σχεδίου | `PUT`/`DELETE /api/drawings/{id}` — Επεξεργασία / Διαγραφή in the viewer |
| `ADMIN` (2675) | Διαχειριστής Εφαρμογής | `POST`/`PUT`/`DELETE /api/lookups/*` — Λίστες επιλογών (nav link + page; direct URL shows a 403 page) and everything above |

Dev mode: `Auth:Rights` is a `true`/`false` map per right name (`VIEW`,
`SCAN`, `PRINT`, `EDIT_SCANNED_SXEDIO`, `ADMIN`), defaults in `appsettings.json`,
overridable in `appsettings.Development.json`; section missing → all rights.
It is read only by `DevAuthBackend` — with `Auth:DevLogin=false` it is ignored. Override per run with env vars, e.g.
`Auth__Rights__ADMIN=false`.

Token plumbing is shared (`Auth/JwtAuth.cs`): `POST /api/auth/login` issues a
signed JWT and sets it as an **HttpOnly, SameSite=Lax** cookie (`ypepascan_auth`);
the response body is `{expiresAt, user}`. The SPA never sees the token — the
browser sends the cookie on every same-origin request, so `/api/*` **and**
`/tiles/*` (DZI tiles, thumbs, served by `Endpoints/TileEndpoints.cs`) all
require login, and `<img>`/PDF frames/OpenSeadragon just work.

Session expiry: token lifetime `Jwt:ExpiresInMinutes` (default 480) with
**sliding renewal** — once less than half the lifetime remains, a request
re-issues the cookie — up to an absolute cap of `Jwt:MaxSessionHours` (default
12) from the original login. Unauthenticated requests get 401 (no redirect);
the SPA handles 401 globally and returns to the login page with `returnTo`.
Uploads pre-flight the session so a long upload doesn't die on an expired
cookie. `POST /api/auth/logout` expires the cookie. CSRF is covered by
SameSite=Lax + all mutations being non-GET; the `Secure` flag is set only when
the request is HTTPS, so plain intranet HTTP still works. The logged-in
username is recorded as `USER_INS` on imports.

## Logging

Serilog (same pattern as meleti-manager: `SerilogInstaller` + config-driven
sinks). Production config writes a rolling daily file to
`C:\YpepaScanWeb\logs\log-<date>.txt` (Warning+, 30 files retained); configure
under `Serilog` in appsettings.json.

## Μονάδα lookup

The Μονάδα filter/column resolves `C16PE_SXEDIO.HSTR_ID` against
`COMMON.G11HAF_STRUCTURE` (`HSTR_ID`/`TITLE`) — the CCC account has read access.
Schema owner configurable via `Oracle:CommonOwner`.

## Configuration

`backend/appsettings.json` holds the **production** settings
(`Storage:Mode=Oracle`, `Auth:DevLogin=false`, cache at `C:\YpepaScanWeb\cache`,
logs at `C:\YpepaScanWeb\logs`); `appsettings.Development.json` overrides for
local dev (`Storage:Mode=Demo`, `Auth:DevLogin=true`). Fill in
`Oracle:ConnectionString` (`User Id=...;Password=...;Data Source=gea-prod01/<service>`)
and change `Jwt:Key` for production.

Paths: `Cache:Dir` (default `<app>/tile-cache`), `Demo:Dir` (default
`<app>/demo-data`).

## Run (demo mode, no Oracle needed)

```powershell
cd backend
dotnet run --urls http://localhost:5580
```

(Development environment → Demo store + dev login.) First start generates four
sample 10000×15000 bilevel TIFFs under `backend/demo-data/` so the viewer can be
exercised at realistic sizes.

## How viewing works

- Browsers cannot render TIFF, and a 150-megapixel scan is far too large to
  serve as one image. On first view of a drawing, libvips (NetVips) builds a
  **Deep Zoom (DZI) tile pyramid** (~1–3 s) into `<Cache:Dir>/<id>/`; after
  that the drawing opens instantly and zooms like a map (OpenSeadragon, bundled
  from npm via Vite — no internet access needed at runtime).
- Files the bundled libvips cannot decode — notably TIFFs with **old-style JPEG
  compression** (tag 6, produced by 1990s-era scanners; the shipped libtiff has
  no OJPEG codec) — fall back to **Magick.NET (ImageMagick)**: the original is
  transcoded once to a temporary plain TIFF and tiled as usual, so such
  drawings simply open (first view a few seconds slower, then cached like any
  other). Only if both decoders fail is the file reported as unreadable
  (HTTP 415 with a clear Greek message).
- File type is detected by **magic bytes** (`Imaging/FileTypes.cs`) and
  reported in `GET /api/drawings/{id}`; unsupported types are rejected on
  import/view. PDFs are served directly from the store and shown with the
  browser's native PDF viewer.
- The tile cache is capped at **1 GB** (`Cache:MaxMegabytes` — set to 1024 in
  the shipped `appsettings.json`; the code default is 500):
  past the cap, the least-recently-viewed drawings are evicted automatically
  and regenerate on next view (~1–3 s). A 10000×15000 scan costs ~6–10 MB of
  tiles, so the default cap keeps roughly the last 100–150 viewed drawings
  instant. The folder can also be deleted manually at any time.
- Loading states everywhere; requests are cancellable end-to-end
  (`CancellationToken` through to Oracle/libvips).

## Importing / editing drawings

- **Καταχώριση σχεδίου** — uploads TIFF/PDF/JPG + metadata and inserts into
  both tables inside one transaction (BLOB is streamed); drag-and-drop zone
  feeds the real file input; upload progress with cancel. New material can
  come from Microsoft Lens phone captures (PDF) or any scanner's scan-to-file
  output.
- **Μαζική καταχώριση** — many files at once: common properties with
  per-file overrides, sequential upload with per-file status; rows are flagged
  `MAZIKI_KATAXWRISI=1`.
- **Edit / delete** — metadata of an existing record can be edited
  (`PUT`) and a record deleted (`DELETE`, with confirmation) from the viewer.
- **Lookups** — categories/types etc. are maintained in-app (`/lookups`).
- **Not in the web app**: direct scanning from a scanner and printing — users
  keep the Windows (dedicated scan) app / scanner or printer software for those
  and upload the resulting file here.

## Version, changelog, manual

- `frontend/src/version.ts` — `APP_VERSION` + `CHANGELOG` (feature-based, Greek,
  written for end users); `frontend/package.json` carries the same version. The
  build date is injected by Vite (`__BUILD_DATE__`).
- `frontend/src/pages/ManualPage.tsx` — the in-app manual; screenshots in
  `frontend/public/manual/` (captured from demo mode).
- **Rule (see `CLAUDE.md`)**: every change bumps the version, adds to the
  changelog, and updates README + manual (and screenshots when the UI changed).

## Not done yet (candidates for next iteration)

- Bulk import from a folder + CSV/Excel metadata sheet (current mass import is
  file-picker based)
- Verify the archive's TIFF/PDF mix with the magic-bytes SQL (see project notes)
