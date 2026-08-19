using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Mis.YpepaScan.Web.Auth.LoginService;

namespace Mis.YpepaScan.Web.Auth;

/// <summary>
/// Application rights (δικαιώματα) — the same five functions the legacy WinForms app
/// registered in the MIS login database (APPLIC_ID 83):
/// <list type="bullet">
///   <item>VIEW (2674) — Προβολή Σχεδίων: search, list, view drawings (the baseline; no VIEW = no access)</item>
///   <item>ADMIN (2675) — Διαχειριστής Εφαρμογής: maintain the lookup lists; implies every other right</item>
///   <item>SCAN (2676) — Σάρωση Σχεδίων: Καταχώριση / Μαζική καταχώριση (upload new drawings)</item>
///   <item>PRINT (2677) — Εκτύπωση Σχεδίων: Λήψη πρωτοτύπου (the web app doesn't print; the download is what you print from)</item>
///   <item>EDIT_SCANNED_SXEDIO (2678) — Επεξεργασία Σχεδίου: edit metadata and delete a drawing</item>
/// </list>
/// The MIS login service returns them per user as APP_RIGHTS; in dev mode they come from
/// Auth:Rights in appsettings (true/false per right; section missing = all rights).
/// They travel in the JWT as <see cref="ClaimType"/> claims and are enforced by the
/// authorization policies registered in <see cref="AddPolicies"/>.
/// </summary>
public static class AppRights
{
    public const string View = "VIEW";
    public const string Admin = "ADMIN";
    public const string Scan = "SCAN";
    public const string Print = "PRINT";
    public const string Edit = "EDIT_SCANNED_SXEDIO";

    public static readonly string[] All = [View, Admin, Scan, Print, Edit];

    /// <summary>Legacy APP_FUNCTION_IDs, used when the service gives an id but an unexpected name.</summary>
    private static readonly Dictionary<int, string> ByFunctionId = new()
    {
        [2674] = View, [2675] = Admin, [2676] = Scan, [2677] = Print, [2678] = Edit,
    };

    public const string ClaimType = "right";

    /// <summary>Policy names = right names; each passes with that right or with ADMIN.</summary>
    public static void AddPolicies(AuthorizationOptions options)
    {
        foreach (var right in All)
            options.AddPolicy(right, p => p.RequireAssertion(ctx => Has(ctx.User, right)));
    }

    public static bool Has(ClaimsPrincipal user, string right)
    {
        foreach (var c in user.FindAll(ClaimType))
            if (c.Value == right || c.Value == Admin) return true;
        return false;
    }

    public static IReadOnlyList<string> Of(ClaimsPrincipal user)
        => user.FindAll(ClaimType).Select(c => c.Value).Distinct().ToArray();

    /// <summary>Rights from the MIS login service's APP_RIGHTS, restricted to the known set.</summary>
    public static IReadOnlyList<string> FromMis(IEnumerable<APP_RIGHT>? rights)
    {
        var set = new HashSet<string>();
        foreach (var r in rights ?? [])
        {
            var name = r.APP_RIGHT1?.Trim().ToUpperInvariant();
            if (name is not null && All.Contains(name)) set.Add(name);
            else if (ByFunctionId.TryGetValue(r.APP_FUNCTION_ID, out var byId)) set.Add(byId);
        }
        return Normalize(set);
    }

    /// <summary>Dev mode: Auth:Rights:{NAME} = true/false. No section at all → every right.</summary>
    public static IReadOnlyList<string> FromConfig(IConfiguration cfg)
    {
        var section = cfg.GetSection("Auth:Rights");
        if (!section.Exists()) return All;
        var set = new HashSet<string>();
        foreach (var right in All)
            if (section.GetValue<bool>(right)) set.Add(right);
        return Normalize(set);
    }

    /// <summary>Stable order; ADMIN expands to everything so the client can test rights one by one.</summary>
    private static IReadOnlyList<string> Normalize(HashSet<string> set)
    {
        if (set.Contains(Admin)) return All;
        return All.Where(set.Contains).ToArray();
    }
}
