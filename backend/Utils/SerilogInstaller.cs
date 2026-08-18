using Serilog;

namespace Sxedia.Web.Utils;

/// <summary>Same bootstrap pattern as MeletiManager: logger built from configuration
/// before the host exists, so startup failures are captured too.</summary>
public static class SerilogInstaller
{
    public static Serilog.ILogger CreateLogger()
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";

        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json")
            .AddJsonFile($"appsettings.{environment}.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        return new LoggerConfiguration()
            .ReadFrom.Configuration(configuration)
            .CreateLogger();
    }
}
