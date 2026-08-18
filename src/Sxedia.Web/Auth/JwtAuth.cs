using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Sxedia.Web.Auth;

public record LoginRequestDto(string Username, string Password);
public record ChangePasswordRequestDto(string CurrentPassword, string NewPassword);
public record UserDto(string Username, string FullName, string Role);
public record AuthResponseDto(string Token, DateTime ExpiresAt, UserDto User);

/// <summary>
/// JWT auth in the MeletiManager style (bearer token, /api/auth endpoints,
/// token kept by the SPA and sent as an Authorization header).
/// Credential check is the temporary dev user from Auth:* config — swap
/// ValidateCredentials for the real user store later; the token plumbing stays.
/// </summary>
public static class JwtAuth
{
    public static void AddJwtAuthentication(this IServiceCollection services, IConfiguration cfg)
    {
        services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = cfg["Jwt:Issuer"],
                    ValidAudience = cfg["Jwt:Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg["Jwt:Key"]!)),
                    ClockSkew = TimeSpan.Zero,
                };
            });
        services.AddAuthorization();
    }

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth");

        auth.MapPost("login", (LoginRequestDto dto, IConfiguration cfg, IWebHostEnvironment env) =>
        {
            if (!ValidateCredentials(dto.Username, dto.Password, cfg, env))
                return Results.Unauthorized();

            var user = new UserDto(dto.Username, dto.Username, "User");
            var (token, expiresAt) = GenerateAccessToken(user, cfg);
            return Results.Ok(new AuthResponseDto(token, expiresAt, user));
        });

        auth.MapGet("me", (ClaimsPrincipal principal) =>
        {
            if (principal.Identity?.IsAuthenticated != true)
                return Results.Unauthorized();
            return Results.Ok(new UserDto(
                principal.Identity.Name ?? "",
                principal.FindFirstValue("FullName") ?? principal.Identity.Name ?? "",
                principal.FindFirstValue(ClaimTypes.Role) ?? "User"));
        }).RequireAuthorization();

        // Stateless tokens for now — logout is client-side (drop the token).
        auth.MapPost("logout", () => Results.Ok(new { message = "Logged out" })).RequireAuthorization();

        auth.MapPost("change-password", (ChangePasswordRequestDto dto, ClaimsPrincipal principal,
            IConfiguration cfg, IWebHostEnvironment env) =>
        {
            var username = principal.Identity?.Name ?? "";
            if (!ValidateCredentials(username, dto.CurrentPassword, cfg, env))
                return Results.BadRequest(new { error = "Ο τρέχων κωδικός δεν είναι σωστός." });
            if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 6)
                return Results.BadRequest(new { error = "Ο νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες." });

            File.WriteAllText(PasswordFile(cfg, env), Hash(dto.NewPassword));
            Serilog.Log.Information("Password changed by {User}", username);
            return Results.Ok(new { message = "Ο κωδικός άλλαξε." });
        }).RequireAuthorization();
    }

    // Password check: the config value is the initial password; once changed via the
    // change-password page, the SHA-256 hash stored in auth.json takes precedence.
    // (Temporary scheme — the real user store replaces all of this.)
    private static bool ValidateCredentials(string username, string password, IConfiguration cfg, IWebHostEnvironment env)
    {
        if (!string.Equals(username, cfg["Auth:Username"] ?? "dev", StringComparison.OrdinalIgnoreCase))
            return false;
        var file = PasswordFile(cfg, env);
        if (File.Exists(file))
            return Hash(password) == File.ReadAllText(file).Trim();
        return password == (cfg["Auth:Password"] ?? "dev");
    }

    private static string PasswordFile(IConfiguration cfg, IWebHostEnvironment env)
        => string.IsNullOrWhiteSpace(cfg["Auth:PasswordFile"])
            ? Path.Combine(env.ContentRootPath, "auth.json")
            : cfg["Auth:PasswordFile"]!;

    private static string Hash(string password)
        => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            Encoding.UTF8.GetBytes("sxedia:" + password)));

    private static (string Token, DateTime ExpiresAt) GenerateAccessToken(UserDto user, IConfiguration cfg)
    {
        var minutes = int.TryParse(cfg["Jwt:ExpiresInMinutes"], out var m) ? m : 720;
        var expiresAt = DateTime.Now.AddMinutes(minutes);

        var claims = new[]
        {
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("FullName", user.FullName),
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(cfg["Jwt:Key"]!));
        var token = new JwtSecurityToken(
            issuer: cfg["Jwt:Issuer"],
            audience: cfg["Jwt:Audience"],
            claims: claims,
            expires: expiresAt,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
