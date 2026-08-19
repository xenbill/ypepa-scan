using Microsoft.AspNetCore.Http.Features;
using Serilog;
using Sxedia.Web.Auth;
using Sxedia.Web.Data;
using Sxedia.Web.Endpoints;
using Sxedia.Web.Imaging;
using Sxedia.Web.Utils;

Log.Logger = SerilogInstaller.CreateLogger();

try
{
    Log.Information("Starting Sxedia (Σχεδιοθήκη) API");

    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog();

    builder.Services.AddSingleton<TileService>();
    var mode = builder.Configuration["Storage:Mode"] ?? "Demo";
    if (mode.Equals("Oracle", StringComparison.OrdinalIgnoreCase))
        builder.Services.AddSingleton<IDrawingStore, OracleDrawingStore>();
    else
        builder.Services.AddSingleton<IDrawingStore, DemoDrawingStore>();

    builder.Services.AddJwtAuthentication(builder.Configuration);

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

    // Dev aid for eyeballing loading states: set a cookie `slow=1500` in the browser
    // (document.cookie = "slow=1500") and every /api response is delayed that many ms.
    if (app.Environment.IsDevelopment())
    {
        app.Use(async (ctx, next) =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api")
                && int.TryParse(ctx.Request.Cookies["slow"], out var ms) && ms is > 0 and <= 30_000)
                await Task.Delay(ms, ctx.RequestAborted);
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

    // SPA fallback so router URLs (/login, /sxedio/123) work on refresh/deep link.
    app.MapFallbackToFile("index.html");

    app.Run();
    Log.Information("Sxedia API shut down gracefully");
}
catch (Exception ex)
{
    Log.Fatal(ex, "Sxedia API terminated unexpectedly");
}
finally
{
    await Log.CloseAndFlushAsync();
}
