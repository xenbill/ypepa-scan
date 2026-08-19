using System.Text;
using static Mis.YpepaScan.Web.Auth.AuthBackendHelpers;
using Mis.YpepaScan.Web.Auth.LoginService;

namespace Mis.YpepaScan.Web.Auth;

public sealed record AuthUser(string Username, string FullName, string Role, int? Category, IReadOnlyList<string> Rights);
public sealed record AuthResult(bool Success, string? Error, AuthUser? User)
{
    public static AuthResult Fail(string error) => new(false, error, null);
    public static AuthResult Ok(AuthUser user) => new(true, null, user);
}

/// <summary>
/// Where credentials are checked. Selected at startup by Auth:DevLogin —
/// true → <see cref="DevAuthBackend"/> (single user from config), false → <see cref="MisAuthBackend"/>
/// (MIS LGNWS SOAP service). Token issuance is shared and lives in <see cref="JwtAuth"/>.
/// </summary>
public interface IAuthBackend
{
    bool IsDevLogin { get; }
    /// <summary>Κατηγορίες προσωπικού offered on the login page (empty → no dropdown).</summary>
    Task<IReadOnlyList<MisCategory>> GetCategoriesAsync();
    Task<AuthResult> LoginAsync(string username, string password, int? category, string userIp);
    /// <returns>null on success, otherwise a user-facing error message.</returns>
    Task<string?> ChangePasswordAsync(string username, int? category, string currentPassword, string newPassword, string userIp);
}

file static class AuthBackendHelpers
{
    public const string NoAccessMessage = "Δεν έχετε δικαίωμα πρόσβασης στην εφαρμογή «Σχέδια ΥΠΕΠΑ».";
    public static string RoleOf(IReadOnlyList<string> rights) => rights.Contains(AppRights.Admin) ? "Admin" : "User";
}

/// <summary>
/// Dev-only credential check: Auth:Username / Auth:Password from config; once changed via
/// the change-password page, the SHA-256 hash stored in auth.json takes precedence.
/// </summary>
public sealed class DevAuthBackend(IConfiguration cfg, IWebHostEnvironment env) : IAuthBackend
{
    public bool IsDevLogin => true;

    public Task<IReadOnlyList<MisCategory>> GetCategoriesAsync()
        => Task.FromResult<IReadOnlyList<MisCategory>>([]);

    public Task<AuthResult> LoginAsync(string username, string password, int? category, string userIp)
    {
        if (!Validate(username, password))
            return Task.FromResult(AuthResult.Fail("Λάθος όνομα χρήστη ή κωδικός."));
        var rights = AppRights.FromConfig(cfg); // Auth:Rights:{VIEW,SCAN,...} = true/false
        if (!rights.Contains(AppRights.View))
            return Task.FromResult(AuthResult.Fail(NoAccessMessage));
        return Task.FromResult(AuthResult.Ok(new AuthUser(username, username, RoleOf(rights), null, rights)));
    }

    public Task<string?> ChangePasswordAsync(string username, int? category, string currentPassword, string newPassword, string userIp)
    {
        if (!Validate(username, currentPassword))
            return Task.FromResult<string?>("Ο τρέχων κωδικός δεν είναι σωστός.");
        File.WriteAllText(PasswordFile, Hash(newPassword));
        return Task.FromResult<string?>(null);
    }

    private bool Validate(string username, string password)
    {
        if (!string.Equals(username, cfg["Auth:Username"] ?? "dev", StringComparison.OrdinalIgnoreCase))
            return false;
        if (File.Exists(PasswordFile))
            return Hash(password) == File.ReadAllText(PasswordFile).Trim();
        return password == (cfg["Auth:Password"] ?? "dev");
    }

    private string PasswordFile
        => string.IsNullOrWhiteSpace(cfg["Auth:PasswordFile"])
            ? Path.Combine(env.ContentRootPath, "auth.json")
            : cfg["Auth:PasswordFile"]!;

    private static string Hash(string password)
        => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            Encoding.UTF8.GetBytes("ypepascan:" + password)));
}

/// <summary>Credential check against the MIS login service (LGNWS). Username = ΑΜΑ.</summary>
public sealed class MisAuthBackend(MisLoginService mis, ILogger<MisAuthBackend> log) : IAuthBackend
{
    public bool IsDevLogin => false;

    public Task<IReadOnlyList<MisCategory>> GetCategoriesAsync() => mis.GetCategoriesAsync();

    public async Task<AuthResult> LoginAsync(string username, string password, int? category, string userIp)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            return AuthResult.Fail("Τα πεδία ΑΜΑ και Κωδικός δεν μπορούν να είναι κενά.");
        if (category is null or <= 0)
            return AuthResult.Fail("Επιλέξτε κατηγορία προσωπικού.");

        User user;
        try
        {
            user = await mis.LoginAsync(username, password, category.Value, userIp);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "MIS login service call failed");
            return AuthResult.Fail($"Η υπηρεσία σύνδεσης δεν είναι διαθέσιμη: {ex.Message}");
        }

        if (user.UserID <= 0)
            return AuthResult.Fail(string.IsNullOrWhiteSpace(user.SRV_MSG) ? "Λάθος ΑΜΑ ή κωδικός." : user.SRV_MSG);
        // Deliberately no DtExp / MustChangePassword gate: an expired password still logs in.

        // Rights come from the service per user/app (APP_RIGHTS). VIEW is the baseline:
        // an account without it (or with no rights at all for this app) cannot log in.
        var rights = AppRights.FromMis(user.APP_RIGHTS);
        if (!rights.Contains(AppRights.View))
        {
            log.LogWarning("Login refused for {User}: no VIEW right (service rights: {Rights})", username,
                string.Join(",", (user.APP_RIGHTS ?? []).Select(r => $"{r.APP_RIGHT1}/{r.APP_FUNCTION_ID}")));
            return AuthResult.Fail(NoAccessMessage);
        }

        return AuthResult.Ok(new AuthUser(username.Trim(), user.UserTitle ?? username, RoleOf(rights), category, rights));
    }

    public async Task<string?> ChangePasswordAsync(string username, int? category, string currentPassword, string newPassword, string userIp)
    {
        if (category is null or <= 0)
            return "Λείπει η κατηγορία προσωπικού.";
        var (ok, message) = await mis.ChangePasswordAsync(username, currentPassword, newPassword, category.Value, userIp);
        if (ok) return null;
        return string.IsNullOrWhiteSpace(message) ? "Η αλλαγή κωδικού απέτυχε!" : message;
    }
}
