using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Sxedia.Web.Auth.LoginService;

namespace Sxedia.Web.Auth;

public record LoginRequestDto(string Username, string Password, int? Category);
public record ChangePasswordRequestDto(string CurrentPassword, string NewPassword);
public record UserDto(string Username, string FullName, string Role, int? Category);
public record AuthResponseDto(DateTime ExpiresAt, UserDto User);
public record AuthModeDto(bool DevLogin, IReadOnlyList<MisCategory> Categories);

/// <summary>
/// Cookie-carried JWT auth. Login issues a signed JWT and stores it in an
/// HttpOnly cookie; the JwtBearer handler reads it back from that cookie, so
/// every same-origin request — fetch calls, &lt;img&gt;, PDF frames, OpenSeadragon
/// tiles — is authenticated without the SPA ever touching the token.
/// Unauthenticated requests get a plain 401 (no login-page redirect), which the
/// SPA handles. CSRF: SameSite=Lax cookie + all mutations are non-GET, so a
/// cross-site page cannot make the browser send the cookie with a state-changing
/// request. Credentials are checked by the registered <see cref="IAuthBackend"/>
/// (Auth:DevLogin=true → config dev user, else the MIS LGNWS service). The
/// employee category chosen at login is kept as a claim because the MIS
/// change-password call needs it again.
/// </summary>
public static class JwtAuth
{
    public const string CookieName = "sxedia_auth";
    public const string CategoryClaim = "Category";

    public static void AddJwtAuthentication(this IServiceCollection services, IConfiguration cfg)
    {
        var devLogin = cfg.GetValue<bool>("Auth:DevLogin");
        if (devLogin)
        {
            services.AddSingleton<IAuthBackend, DevAuthBackend>();
        }
        else
        {
            services.Configure<LoginServiceOptions>(cfg.GetSection("Auth:LoginService"));
            services.AddSingleton<MisLoginService>();
            services.AddSingleton<IAuthBackend, MisAuthBackend>();
        }

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
                options.Events = new JwtBearerEvents
                {
                    // Token lives in the auth cookie (a Bearer header still works, e.g. for scripts).
                    OnMessageReceived = ctx =>
                    {
                        if (string.IsNullOrEmpty(ctx.Token) && ctx.Request.Cookies.TryGetValue(CookieName, out var t))
                            ctx.Token = t;
                        return Task.CompletedTask;
                    },
                };
            });
        services.AddAuthorization();
    }

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth");

        // Login page bootstrap: dev mode? which κατηγορίες προσωπικού to offer?
        auth.MapGet("mode", async (IAuthBackend backend) =>
            Results.Ok(new AuthModeDto(backend.IsDevLogin, await backend.GetCategoriesAsync())));

        auth.MapPost("login", async (LoginRequestDto dto, HttpContext http, IAuthBackend backend, IConfiguration cfg) =>
        {
            var result = await backend.LoginAsync(dto.Username ?? "", dto.Password ?? "", dto.Category, ClientIp(http));
            if (!result.Success || result.User is null)
                return Results.Json(new { error = result.Error }, statusCode: StatusCodes.Status401Unauthorized);

            var user = new UserDto(result.User.Username, result.User.FullName, result.User.Role, result.User.Category);
            var (token, expiresAt) = GenerateAccessToken(user, cfg);
            http.Response.Cookies.Append(CookieName, token, CookieOptions(http, expiresAt));
            Serilog.Log.Information("Login {User} (category {Category})", user.Username, user.Category);
            return Results.Ok(new AuthResponseDto(expiresAt, user));
        });

        auth.MapGet("me", (ClaimsPrincipal principal) =>
        {
            if (principal.Identity?.IsAuthenticated != true)
                return Results.Unauthorized();
            return Results.Ok(CurrentUser(principal));
        }).RequireAuthorization();

        // Stateless tokens: logout = drop the cookie.
        auth.MapPost("logout", (HttpContext http) =>
        {
            http.Response.Cookies.Delete(CookieName, CookieOptions(http, null));
            return Results.Ok(new { message = "Logged out" });
        });

        auth.MapPost("change-password", async (ChangePasswordRequestDto dto, ClaimsPrincipal principal,
            HttpContext http, IAuthBackend backend) =>
        {
            if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 6)
                return Results.BadRequest(new { error = "Ο νέος κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες." });

            var me = CurrentUser(principal);
            var error = await backend.ChangePasswordAsync(me.Username, me.Category, dto.CurrentPassword ?? "", dto.NewPassword, ClientIp(http));
            if (error is not null)
                return Results.BadRequest(new { error });

            Serilog.Log.Information("Password changed by {User}", me.Username);
            return Results.Ok(new { message = "Ο κωδικός άλλαξε." });
        }).RequireAuthorization();
    }

    private static UserDto CurrentUser(ClaimsPrincipal principal)
    {
        var name = principal.Identity?.Name ?? "";
        int? category = int.TryParse(principal.FindFirstValue(CategoryClaim), out var c) ? c : null;
        return new UserDto(
            name,
            principal.FindFirstValue("FullName") ?? name,
            principal.FindFirstValue(ClaimTypes.Role) ?? "User",
            category);
    }

    private static string ClientIp(HttpContext http)
        => http.Connection.RemoteIpAddress?.MapToIPv4().ToString() ?? "";

    // HttpOnly: JS never sees the token. SameSite=Lax: sent on same-site requests and
    // top-level navigations (deep links from e-mail work), never on cross-site POSTs.
    // Secure only when the request itself is HTTPS — the app may be deployed on plain
    // intranet HTTP, where a Secure cookie would simply never be sent back.
    private static CookieOptions CookieOptions(HttpContext http, DateTime? expiresAt) => new()
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Lax,
        Secure = http.Request.IsHttps,
        Path = "/",
        Expires = expiresAt,
        IsEssential = true,
    };

    private static (string Token, DateTime ExpiresAt) GenerateAccessToken(UserDto user, IConfiguration cfg)
    {
        var minutes = int.TryParse(cfg["Jwt:ExpiresInMinutes"], out var m) ? m : 480;
        var expiresAt = DateTime.Now.AddMinutes(minutes);

        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Role, user.Role),
            new("FullName", user.FullName),
        };
        if (user.Category is not null)
            claims.Add(new Claim(CategoryClaim, user.Category.Value.ToString()));

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
