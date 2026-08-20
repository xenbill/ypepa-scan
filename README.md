# Σχεδιοθήκη ΥΠΕΠΑ (Mis.YpepaScan.Web)

Standalone web app that replaces the legacy VB WinForms drawing-scan archive.
It reads/writes the **existing Oracle tables** (`CCC.C16PE_SXEDIO`,
`CCC.C16PE_SXEDIO_BLOB` + lookups) unchanged, so all ~47,000 archived drawings
appear immediately — no migration.

Project/assembly: `Mis.YpepaScan.Web` (namespaces `Mis.YpepaScan.Web.*`),
solution `Mis.YpepaScan.slnx`. Deployed DLL: `Mis.YpepaScan.Web.dll` (see
`backend/web.config` for IIS and `docs/iis-setup.md` for the server-side IIS
settings: always-on app pool, preload/warm-up, upload limit).

## Structure

- `backend` — ASP.NET Core (.NET 10) minimal API + serves the built frontend
  from `wwwroot`. `Auth/` (JWT + login backends), `Data/` (Oracle/Demo stores,
  DTOs), `Endpoints/` (drawings, lookups, tiles), `Imaging/` (libvips tiling,
  file-type sniffing), `Utils/` (Serilog).
- `frontend` — React + TypeScript (Vite). TanStack Query for data
  fetching/caching, React Router. `npm run build` type-checks and outputs into
  `backend/wwwroot`, so the deployable is still the single .NET app
  (`dotnet publish` runs the frontend build automatically). Lightweight modern
  CSS (no animations), ES2015 output for older PCs; React and OpenSeadragon are
  bundled — no CDN needed. For frontend development: `npm run dev` (serves on
  :5173, proxies `/api` and `/tiles` to the .NET app on :5580). Layout under
  `src`:
  - `api/` — one module per area of the API: `http.ts` (fetch wrapper, error
    classes, the only place a failed response becomes an `Error`), `auth.ts`
    (session + rights), `drawings.ts`, `lookups.ts`, `types.ts` (the DTOs).
  - `app/` — the shell: `queryClient.ts` (React Query + the app-wide 401 /
    "server unreachable" policy), `RequireAuth.tsx` (session gate),
    `routes.tsx` (route table, lazy routes; a **data router**
    (`createBrowserRouter`) because the import pages' leave guard needs
    `useBlocker`). `main.tsx` only boots.
  - `drawings/` — the Σχέδια screen: `DrawingsPage.tsx`, `useListState.ts`
    (filters/sort/page in the URL, page size in localStorage),
    `DrawingFilters.tsx`, `ResultsTable.tsx`, `Pager.tsx`, `EmptyResults.tsx`;
    `meta/` (the drawing's fields, defined once — see below); `import/`
    (the «Καταχώριση» and «Μαζική καταχώριση» **pages** — `ImportPage.tsx`,
    `MassImportPage.tsx` — with `useUploadQueue.ts` running the batch).
  - `viewer/` — OpenSeadragon viewer + its metadata edit form.
  - `pages/` — the remaining screens (login, home, lookups, manual, change
    password, status/404). `components/` — what more than one screen uses
    (layout, combo select, loading, `Modal.tsx` = the dialog shell: backdrop,
    click-outside, the Escape stack; the confirm dialog; `toasts.tsx` =
    top-center success notifications, mounted once at the route root —
    errors stay inline next to the action; `useLeaveGuard.ts`). `lib/` —
    `format.ts` (el-GR dates/sizes), `storage.ts` (localStorage that cannot
    throw).
  - `styles/` — the stylesheet, split by role; `src/index.css` imports the
    parts and is what fixes their cascade order (see the comment there).
  - The metadata of a drawing is described once in `drawings/meta/fields.ts`
    (label, length, which pick list, and the conversions to FormData /
    `DrawingMeta`); the three screens that edit it — Καταχώριση, Μαζική
    καταχώριση, Επεξεργασία in the viewer — render from it through
    `meta/MetaForm.tsx` and only decide the layout. Add or rename a field
    there and all three follow.

## Pages / routes

| Route | What |
|---|---|
| `/login` | Login (username = ΑΜΑ, password, κατηγορία προσωπικού when the MIS backend is active) |
| `/` | Home: counts per category / type / unit — each row links to the filtered list |
| `/drawings` | Drawing list (`drawings/`): filters, sort, page, page size (10/20/50/100, default 10, remembered) all live in the URL so Back/close return to the same list. Columns are drag-resizable from the header edge; widths persist in localStorage (`ypepascan.colWidths`), double-click a grip or «Επαναφορά πλάτους στηλών» restores automatic sizing |
| `/drawings/import` | «Καταχώριση σχεδίου» page (`SCAN` right; others get a 403 page). Required fields (number, file) validate inline (red mark + message, `noValidate` — no browser bubbles). On success returns to the list with a success toast. Leaving with an upload running or a filled-in form asks for confirmation (in-app dialog + browser `beforeunload`); legacy `/drawings?import=1` links redirect here |
| `/drawings/import/mass` | «Μαζική καταχώριση» page (same guard). When a run ends with every file imported it returns to the list with a toast saying how many; with errors or after «Διακοπή» it stays for fixing/retrying. Legacy `/drawings?import=mass` links redirect here |
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

The user menu labels each right by what it unlocks **here** (`APP_RIGHTS` in
`frontend/src/api/auth.ts`), because the legacy names mislead in this app —
«Εκτύπωση Σχεδίων» only downloads the original and «Σάρωση Σχεδίων» does not
scan anything. The mapping to the MIS descriptions is the table below (and the
manual's «Δικαιώματα» section); it is not shown in the app.

| Right (legacy id) | Legacy description | Shown in the user menu | Gates in the web app |
|---|---|---|---|
| `VIEW` (2674) | Προβολή Σχεδίων | Αναζήτηση & προβολή σχεδίων | Baseline: required to log in at all (otherwise «Δεν έχετε δικαίωμα πρόσβασης…»); search, list, view, inline PDF, tiles |
| `SCAN` (2676) | Σάρωση Σχεδίων | Καταχώριση & μαζική καταχώριση | `POST /api/drawings` — the `/drawings/import` and `/drawings/import/mass` pages (buttons on the list page and the home page; direct URL without the right shows a 403 page) |
| `PRINT` (2677) | Εκτύπωση Σχεδίων | Λήψη πρωτοτύπου | `GET /api/drawings/{id}/file` as attachment — «Λήψη πρωτοτύπου» (`?inline=true`, the viewer's PDF frame, is viewing). Without it the PDF iframe gets `#toolbar=0` so Chrome/Edge hide their download/print buttons (UI only; Firefox ignores it) |
| `EDIT_SCANNED_SXEDIO` (2678) | Επεξεργασία Σχεδίου | Επεξεργασία & διαγραφή | `PUT`/`DELETE /api/drawings/{id}` — Επεξεργασία / Διαγραφή in the viewer |
| `ADMIN` (2675) | Διαχειριστής Εφαρμογής | Διαχείριση λιστών επιλογών | `POST`/`PUT`/`DELETE /api/lookups/*` — Λίστες επιλογών (nav link + page; direct URL shows a 403 page) and everything above |

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
  no OJPEG codec) — go through a fallback chain, cheapest first: (1) if the
  TIFF wraps one complete JPEG interchange stream (tags 513/514 — the usual
  OJPEG shape, and self-describing even when the TIFF tags contradict it),
  that stream is extracted by byte copy and tiled directly; (2) otherwise the
  original is transcoded once via **Magick.NET (ImageMagick)** to a temporary
  plain TIFF and tiled as usual. Either way such drawings simply open (first
  view a few seconds slower, then cached like any other). Only if every
  decoder fails is the file reported as unreadable (HTTP 415 with a clear
  Greek message), together with a logged `TIFF diagnostics:` line describing
  what the file claims to be.
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
- **Browser caching of the frontend** (`Program.cs`, `StaticFileOptions`): the
  files Vite fingerprints (`/assets/*`) are served `immutable` for a year;
  everything else in `wwwroot` — `index.html` first of all, plus the manual
  screenshots and the favicon — is served `no-cache`, i.e. revalidate (the ETag
  answers 304, so nothing is re-downloaded). The header matters: without it the
  browser picks its own freshness lifetime and a returning user can keep an
  `index.html` pointing at asset names the next build has already deleted. The
  rule is configured through DI so `MapFallbackToFile` (every SPA route) uses it
  too. Tiles set their own `immutable` header in `TileEndpoints`.
- Loading states everywhere; requests are cancellable end-to-end
  (`CancellationToken` through to Oracle/libvips).

## Importing / editing drawings

- **Καταχώριση σχεδίου** (`/drawings/import`, a page of its own) — uploads
  TIFF/PDF/JPG + metadata and inserts into
  both tables inside one transaction (BLOB is streamed). New ids come from the
  legacy Oracle sequences (`C16PE_SXEDIO_SEQ`, and `C16PE_*_SEQ` for the
  lookups), the same ones the old WinForms app uses, so both apps can insert
  side by side without collisions. Drag-and-drop zone
  feeds the real file input; upload progress with cancel. On success the page
  returns to the list and confirms with a toast. New material can
  come from Microsoft Lens phone captures (PDF) or any scanner's scan-to-file
  output.
- **Μαζική καταχώριση** (`/drawings/import/mass`) — many files at once: common
  properties with
  per-file overrides, sequential upload with per-file status; rows are flagged
  `MAZIKI_KATAXWRISI=1`. A run that imports every file returns to the list;
  errors keep the page open for retrying.
- Both import pages guard against losing work: navigating away with an upload
  in flight or a filled-in form asks for confirmation (router `useBlocker` +
  `beforeunload`, see `components/useLeaveGuard.ts`).
- **Edit / delete** — metadata of an existing record can be edited
  (`PUT`) and a record deleted (`DELETE`, with confirmation) from the viewer.
  Deletion is a **soft delete on the header row only** (`DELETED=1` on
  `C16PE_SXEDIO`); the blob is never touched, so clearing the flag restores
  the drawing. The drawing's cached tile pyramid is purged on delete, so the
  tiles stop being servable immediately (a restored drawing regenerates its
  pyramid on first view).
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
