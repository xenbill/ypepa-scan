# Σχεδιοθήκη ΥΠΕΠΑ (Mis.YpepaScan.Web)

Standalone web app that replaces the legacy VB WinForms drawing-scan archive.
It reads/writes the **existing Oracle tables** (`CCC.C16PE_SXEDIO`,
`CCC.C16PE_SXEDIO_BLOB` + lookups) unchanged, so all ~47,000 archived drawings
appear immediately — no migration. The only schema addition is one new table,
`CCC.C16PE_SXEDIO_DELETED` (see [Deletion](#deletion)), which the legacy
application never looks at.

Project/assembly: `Mis.YpepaScan.Web` (namespaces `Mis.YpepaScan.Web.*`),
solution `Mis.YpepaScan.slnx`. Deployed DLL: `Mis.YpepaScan.Web.dll` (see
`backend/web.config` for IIS and `docs/iis-setup.md` for the server-side IIS
settings: always-on app pool, preload/warm-up, upload limit).

## Structure

- `backend` — ASP.NET Core (.NET 10) minimal API + serves the built frontend
  from `wwwroot`. `Auth/` (JWT + login backends), `Data/` (`IDrawingStore`;
  `Models/` — records split by concern: `DrawingModels`, `LookupModels`,
  `StatsModels`; `Oracle/` — `OracleDrawingStore` as partial files per table:
  `.Drawings`, `.Blob`, `.Archive`, `.Lookups`; `Demo/` — `DemoDrawingStore` +
  seeder), `Endpoints/` (drawings, lookups, tiles), `Imaging/` (libvips tiling,
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
- `GET /api/config` — what the import UI may offer: `cadEnabled` + the accepted
  file extensions (single source of truth: `FileTypes` + the CAD feature flag);
  the SPA builds its file pickers and the manual/changelog content from this
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

## Deletion

The legacy WinForms application selects from `C16PE_SXEDIO` with no notion of a
deleted flag, so a flagged row would keep showing up there. Deleting therefore
**moves the header row out of the table the old application reads**: one
transaction copies it into `CCC.C16PE_SXEDIO_DELETED` and deletes it from
`CCC.C16PE_SXEDIO` (`OracleDrawingStore.DeleteAsync`). Both applications then
stop listing the drawing.

- The archive row gets its own key, `ID` — a **v7 GUID** as a 36-char string
  (`Guid.CreateVersion7()`), time-ordered, so the archive reads in deletion
  order. `SXEDIO_ID` is kept as a plain column (deleting and re-deleting the
  same id over time is fine — each deletion is its own row).
- `DELETED_AT`/`DELETED_BY` record when and by whom (the logged-in user).
- **The blob row is not touched.** `C16PE_SXEDIO_BLOB` keeps the scan under the
  old `SXEDIO_ID`, orphaned; nothing serves it, because every read joins the
  header row. Restoring a drawing is inserting the header row back into
  `C16PE_SXEDIO` from the archive — the file is still there.
- Nothing in the UI reads the archive; it is an audit/undo table maintained
  from SQL*Plus.

Run once, as the `CCC` schema owner (`Oracle:Owner`):

```sql
-- 1. Archive table: same columns as C16PE_SXEDIO (CTAS copies the column types,
--    no keys/indexes), plus the archive's own key and audit columns.
create table CCC.C16PE_SXEDIO_DELETED as
  select * from CCC.C16PE_SXEDIO where 1 = 0;

alter table CCC.C16PE_SXEDIO_DELETED add (
  ID         varchar2(36),
  DELETED_AT date default sysdate not null,
  DELETED_BY varchar2(100)
);

alter table CCC.C16PE_SXEDIO_DELETED
  add constraint C16PE_SXEDIO_DELETED_PK primary key (ID);

create index C16PE_SXEDIO_DELETED_IX
  on CCC.C16PE_SXEDIO_DELETED (SXEDIO_ID);
```

```sql
-- 2. Only if the old DELETED flag column exists: move the rows already flagged
--    into the archive, then drop the column from both tables. sys_guid() ids are
--    plain GUIDs, not v7 — only deletions made by the app are time-ordered.
insert into CCC.C16PE_SXEDIO_DELETED
  (ID, DELETED_AT, DELETED_BY,
   SXEDIO_ID, KODIKOS_ERG, ARITHMOS_SXED, EIDOS_SXED_ID, TITLOS_ERG, TITLOS_SXED,
   PERIGRAFH_SXED, PERIGRAFH_ERG, YPOKAT_ERG_ID, HMER, XOROS_APOTH_ID, KATHG_ERG_ID,
   HSTR_ID, DATE_INS, USER_INS, MAZIKI_KATAXWRISI)
select lower(regexp_replace(rawtohex(sys_guid()),
              '(.{8})(.{4})(.{4})(.{4})(.{12})', '\1-\2-\3-\4-\5')),
       sysdate, null,
       s.SXEDIO_ID, s.KODIKOS_ERG, s.ARITHMOS_SXED, s.EIDOS_SXED_ID, s.TITLOS_ERG, s.TITLOS_SXED,
       s.PERIGRAFH_SXED, s.PERIGRAFH_ERG, s.YPOKAT_ERG_ID, s.HMER, s.XOROS_APOTH_ID, s.KATHG_ERG_ID,
       s.HSTR_ID, s.DATE_INS, s.USER_INS, s.MAZIKI_KATAXWRISI
  from CCC.C16PE_SXEDIO s
 where nvl(s.DELETED, 0) = 1;

delete from CCC.C16PE_SXEDIO where nvl(DELETED, 0) = 1;

alter table CCC.C16PE_SXEDIO         drop column DELETED;
alter table CCC.C16PE_SXEDIO_DELETED drop column DELETED;  -- came with the CTAS copy

commit;
```

The app writes the archive with an explicit column list, so extra legacy columns
copied by the CTAS are simply left null. If `C16PE_SXEDIO` has `not null` columns
the app does not write, CTAS carries the `not null` over and the insert would
fail — relax those in the archive table.

Restoring one drawing (`&id` = the `SXEDIO_ID`):

```sql
insert into CCC.C16PE_SXEDIO
  (SXEDIO_ID, KODIKOS_ERG, ARITHMOS_SXED, EIDOS_SXED_ID, TITLOS_ERG, TITLOS_SXED,
   PERIGRAFH_SXED, PERIGRAFH_ERG, YPOKAT_ERG_ID, HMER, XOROS_APOTH_ID, KATHG_ERG_ID,
   HSTR_ID, DATE_INS, USER_INS, MAZIKI_KATAXWRISI)
select SXEDIO_ID, KODIKOS_ERG, ARITHMOS_SXED, EIDOS_SXED_ID, TITLOS_ERG, TITLOS_SXED,
       PERIGRAFH_SXED, PERIGRAFH_ERG, YPOKAT_ERG_ID, HMER, XOROS_APOTH_ID, KATHG_ERG_ID,
       HSTR_ID, DATE_INS, USER_INS, MAZIKI_KATAXWRISI
  from CCC.C16PE_SXEDIO_DELETED where SXEDIO_ID = &id;

delete from CCC.C16PE_SXEDIO_DELETED where SXEDIO_ID = &id;
commit;
```

## Configuration

`backend/appsettings.json` holds the **production** settings
(`Storage:Mode=Oracle`, `Auth:DevLogin=false`, cache at `C:\YpepaScanWeb\cache`,
logs at `C:\YpepaScanWeb\logs`); `appsettings.Development.json` overrides for
local dev (`Storage:Mode=Demo`, `Auth:DevLogin=true`). Fill in
`Oracle:ConnectionString` (`User Id=...;Password=...;Data Source=gea-prod01/<service>`)
and change `Jwt:Key` for production.

Paths: `Cache:Dir` (default `<app>/tile-cache`), `Demo:Dir` (default
`<app>/Data/Demo/data`).

CAD viewing: `Cad:Enabled` — the feature flag (default `true`; `false` rejects
CAD files on import/view — the original still downloads — and hides every CAD
mention from the UI); `Cad:RequireLicense` — `true` disables the feature when
the licence file is missing, instead of the default evaluation-mode rendering
(default `false`); `Aspose:LicensePath` — the Aspose.CAD `.lic` file (production
default `C:\YpepaScanWeb\Aspose.CAD.lic`; missing/invalid → evaluation mode,
watermarked renders, warning in the log); `Cad:RasterPixels` — long side of the
CAD render in pixels (default 6000; higher = crisper
deep zoom, more transient RAM per first view).

## Run (demo mode, no Oracle needed)

```powershell
cd backend
dotnet run --urls http://localhost:5580
```

(Development environment → Demo store + dev login.) First start generates four
sample 10000×15000 bilevel TIFFs under `backend/Data/Demo/data/` so the viewer can be
exercised at realistic sizes, plus — when the CAD feature is enabled — a fifth
drawing seeded from `backend/Data/Demo/assets/mechanical-sample.dxf`, a real AutoCAD
DXF (CADKit sample drawing) that exercises the CAD render path. Delete
`backend/Data/Demo/data/` to re-seed.

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
- **CAD files (DWG/DXF/DWT, DGN, DWF/DWFX)** are vectors libvips cannot decode:
  on first view **Aspose.CAD** (`Imaging/CadRaster.cs`) renders them once to a
  temporary high-resolution PNG (model space, white background, entity colours;
  long side `Cad:RasterPixels`, default 6000 px) and that raster is tiled into
  the same DZI pyramid — cached and LRU-evicted like any scan. The Aspose
  licence file is loaded lazily from `Aspose:LicensePath`; without it rendering
  still works but Aspose watermarks the output (logged as a warning). The
  original CAD file stays in the store untouched and is what «Λήψη πρωτοτύπου»
  downloads. The whole feature sits behind **`Cad:Enabled`** (default `true`);
  with `Cad:RequireLicense=true` it additionally disables itself when the
  licence file is missing (instead of the default watermark behaviour). When
  disabled, CAD files are rejected like any unsupported type and the SPA
  (pickers, manual, changelog — via `GET /api/config`) shows no CAD mention.
- File type is detected by **magic bytes** (`Imaging/FileTypes.cs`) and
  reported in `GET /api/drawings/{id}`; unsupported types are rejected on
  import/view. Formats without a fixed magic get bespoke checks: ASCII DXF by
  its group-code shape (`0`/`SECTION` opening pair), DGN v7 by its ISFF element
  header, and the container formats by `FileTypes.Resolve` looking inside —
  DWFX is a ZIP/OPC package (telltale `*.dwfseq` entry), DGN v8 an OLE compound
  file (streams named `Dgn~*`). Resolve runs wherever the full stream is at
  hand (import, view, download); the Oracle metadata query only reads the head,
  so there a DWFX/DGN-v8 may report as generic zip/ole — display only. PDFs are
  served directly from the store and shown with the browser's native PDF
  viewer.
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
  TIFF/PDF/JPG/DWG/DXF/DGN/DWF (see `FileTypes.Supported`) + metadata and inserts into
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
  Deletion moves the header row into `C16PE_SXEDIO_DELETED` — see
  [Deletion](#deletion). The drawing's cached tile pyramid is purged on delete,
  so the tiles stop being servable immediately (a restored drawing regenerates
  its pyramid on first view).
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
