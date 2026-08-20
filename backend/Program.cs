using Microsoft.AspNetCore.Http.Features;
using Serilog;
using Mis.YpepaScan.Web.Auth;
using Mis.YpepaScan.Web.Data;
using Mis.YpepaScan.Web.Endpoints;
using Mis.YpepaScan.Web.Imaging;
using Mis.YpepaScan.Web.Utils;

Log.Logger = SerilogInstaller.CreateLogger();

try
{
    Log.Information("Starting YpepaScan (Σχεδιοθήκη) API");

    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog();

    builder.Services.AddSingleton<TileService>();
    var mode = builder.Configuration["Storage:Mode"] ?? "Demo";
    if (mode.Equals("Oracle", StringComparison.OrdinalIgnoreCase))
        builder.Services.AddSingleton<IDrawingStore, OracleDrawingStore>();
    else
        builder.Services.AddSingleton<IDrawingStore, DemoDrawingStore>();

    builder.Services.AddJwtAuthentication(builder.Configuration);

    // Static files (the built frontend in wwwroot). Vite fingerprints everything it
    // emits under /assets, so those can be cached forever; anything else — index.html
    // above all, plus the manual screenshots and the favicon — must be revalidated.
    // Without a Cache-Control header the browser is free to invent a freshness
    // lifetime, and a returning browser can then keep an index.html that points at
    // asset file names the next build has already deleted. "no-cache" does not mean
    // "download every time": the ETag still answers with a 304.
    // Configured here rather than on UseStaticFiles() so that MapFallbackToFile —
    // which serves index.html for every SPA route and reads its options from DI —
    // is covered by the same rule.
    builder.Services.Configure<StaticFileOptions>(o => o.OnPrepareResponse = ctx =>
        ctx.Context.Response.Headers.CacheControl =
            ctx.Context.Request.Path.StartsWithSegments("/assets")
                ? "public, max-age=31536000, immutable"
                : "no-cache");

    // Imports can be large scans
    builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 500L * 1024 * 1024);
    builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 500L * 1024 * 1024);

    var app = builder.Build();

    app.UseSerilogRequestLogging();

    // Client went away (aborted upload, superseded search, closed tab): the endpoint's
    // CancellationToken fires and throws OperationCanceledException. That's expected,
    // not an error — swallow it instead of logging a stack trace / returning 500.
    app.Use(async (ctx, next) =>
    {
        try { await next(ctx); }
        catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
        {
            Log.Debug("Request {Method} {Path} cancelled by client", ctx.Request.Method, ctx.Request.Path);
        }
    });

    // Dev aids for eyeballing loading/error states (cookies set from the browser console):
    //   document.cookie = "slow=1500"  -> every /api response delayed that many ms
    //   document.cookie = "fail=503"   -> every /api request answered with that status
    if (app.Environment.IsDevelopment())
    {
        app.Use(async (ctx, next) =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api"))
            {
                if (int.TryParse(ctx.Request.Cookies["slow"], out var ms) && ms is > 0 and <= 30_000)
                    await Task.Delay(ms, ctx.RequestAborted);
                if (int.TryParse(ctx.Request.Cookies["fail"], out var status) && status is >= 400 and <= 599)
                {
                    ctx.Response.StatusCode = status;
                    return;
                }
            }
            await next(ctx);
        });
    }

    app.UseDefaultFiles();
    app.UseStaticFiles();

    // Tile cache dir must exist before TileService writes / TileEndpoints reads.
    Directory.CreateDirectory(app.Services.GetRequiredService<TileService>().CacheDir);

    app.UseAuthentication();
    app.UseAuthorization();

    app.MapAuthEndpoints();
    app.MapTileEndpoints(); // /tiles/* — login required (cookie)

    // ---- data (login required) ----------------------------------------------
    var api = app.MapGroup("/api").RequireAuthorization();
    api.MapDrawingEndpoints();
    api.MapLookupEndpoints();

    // SPA fallback so router URLs (/login, /drawings/123) work on refresh/deep link.
    app.MapFallbackToFile("index.html");

    app.Run();
    Log.Information("YpepaScan API shut down gracefully");
}
catch (Exception ex)
{
    Log.Fatal(ex, "YpepaScan API terminated unexpectedly");
}
finally
{
    await Log.CloseAndFlushAsync();
}
