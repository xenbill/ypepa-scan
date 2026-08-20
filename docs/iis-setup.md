# IIS setup — Σχέδια ΥΠΕΠΑ (Mis.YpepaScan.Web)

Server-side IIS settings the app expects. The deployable itself is
`dotnet publish` output (single .NET app, in-process hosting — see
`backend/web.config`); everything below is configured **once on the
IIS server**, not in the repo.

All PowerShell below runs **elevated, on the server**. Replace
`YpepaScanWeb` with the actual app-pool / site name.

## 1. Prerequisites (once per server)

| What | Why |
|---|---|
| .NET Hosting Bundle (same major as the app, .NET 10) | Provides `AspNetCoreModuleV2` used by `web.config` |
| **Application Initialization** module (`Web-AppInit`) | Required by the `<applicationInitialization>` block in `web.config` — **without it the site fails with HTTP 500.19**. It is what actually fires the warm-up request; the app-pool settings alone only keep the (cold) worker process alive |

```powershell
# Windows Server
Install-WindowsFeature Web-AppInit
# Client Windows (10/11)
Enable-WindowsOptionalFeature -Online -FeatureName IIS-ApplicationInit

# Verify (either flavour):
Get-WebGlobalModule -Name ApplicationInitializationModule   # Image: ...\warmup.dll
```

## 2. Application pool — always on

IIS Manager → Application Pools → *pool* → Advanced Settings, or:

```powershell
Import-Module WebAdministration
Set-ItemProperty IIS:\AppPools\YpepaScanWeb -Name startMode -Value AlwaysRunning
Set-ItemProperty IIS:\AppPools\YpepaScanWeb -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
```

| Setting | Value | Default | Effect |
|---|---|---|---|
| Start Mode | `AlwaysRunning` | OnDemand | Worker process starts with IIS, not on first request |
| Idle Time-out | `0` | 20 min | App never shuts down during quiet periods |
| .NET CLR version | `No Managed Code` | — | ASP.NET Core runs its own runtime |

Optional — pin the daily recycle (default is every 29 h at a drifting time)
to a fixed off-hours moment:

```powershell
Clear-ItemProperty IIS:\AppPools\YpepaScanWeb -Name recycling.periodicRestart.time
Set-ItemProperty  IIS:\AppPools\YpepaScanWeb -Name recycling.periodicRestart.schedule -Value @{value="03:30:00"}
```

## 3. Site — preload

IIS Manager → Sites → *site* → Advanced Settings → **Preload Enabled = True**, or:

```powershell
Set-ItemProperty "IIS:\Sites\YpepaScanWeb" -Name applicationDefaults.preloadEnabled -Value $true
```

With preload on, the AppInit module sends the warm-up requests declared in
`backend/web.config` (`/` and `/api/auth/mode`) at process start and after
every recycle (`doAppInitAfterRestart="true"`), so the first real user never
hits a cold app.

## 4. Upload limit

`web.config` already raises `maxAllowedContentLength` to **500 MB** (IIS
default ~30 MB) to match the Kestrel/form limits in `Program.cs` — nothing to
configure server-side, just don't override it at server level.

## 5. Things the app assumes

- **Single worker process** — do **not** set Maximum Worker Processes > 1
  (web garden): the tile-cache locking is in-process.
- The app pool identity needs **read/write** on the tile cache dir
  (`Cache:Dir` in `appsettings.json`, e.g. `C:\YpepaScanWeb\cache`) and the
  Serilog log dir.
- Oracle connectivity per `appsettings.json`; no internet access is needed at
  runtime (all frontend assets are bundled).
