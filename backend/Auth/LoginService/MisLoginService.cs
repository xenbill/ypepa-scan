using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.Extensions.Options;

namespace Sxedia.Web.Auth.LoginService;

/// <summary>Bound from Auth:LoginService.</summary>
public sealed class LoginServiceOptions
{
    /// <summary>SOAP endpoint of LGNWS Service.asmx, e.g. http://host/LGNWS/Service.asmx</summary>
    public string Address { get; set; } = "";
    /// <summary>Application code registered in the MIS login database.</summary>
    public string AppDbCode { get; set; } = "";
    /// <summary>Basic credentials the SOAP client presents to the service.</summary>
    public string ServiceUsername { get; set; } = "lgnusr";
    public string ServicePassword { get; set; } = "lgnusr1";
}

public sealed record MisCategory(int Id, string Name);

/// <summary>
/// Thin client for the MIS login web service (LGNWS). Logic copied from
/// Mis.Common.LoginServiceWrapper.Wrapper, minus the static/hard-coded parts:
/// address, app code and service credentials come from <see cref="LoginServiceOptions"/>.
/// </summary>
public sealed class MisLoginService(IOptions<LoginServiceOptions> options, ILogger<MisLoginService> log)
{
    private readonly LoginServiceOptions _o = options.Value;

    private ServiceSoapClient CreateClient()
    {
        if (string.IsNullOrWhiteSpace(_o.Address))
            throw new InvalidOperationException("Auth:LoginService:Address is not configured.");
        var client = new ServiceSoapClient(ServiceSoapClient.EndpointConfiguration.ServiceSoap, _o.Address);
        client.ClientCredentials.UserName.UserName = _o.ServiceUsername;
        client.ClientCredentials.UserName.Password = _o.ServicePassword;
        return client;
    }

    // Wrapper passes the machine's Windows user unless the app is the "TestLogin" one.
    private string WindowsUser => _o.AppDbCode != "TestLogin" ? Environment.UserName : "";

    public async Task<User> LoginAsync(string username, string password, int category, string userIp)
    {
        using var client = CreateClient();
        using var des = new Simple3Des();
        var encryptedPassword = des.EncryptData(password.Trim().Sanitize());

        var user = await client.LogInAsync(
            category,
            username.Trim().Sanitize(),
            encryptedPassword,
            _o.AppDbCode,
            B_DEBUG: false,
            userIp,
            WindowsUser);

        if (user.UserID != -1 && user.UserTitle is not null)
            user.UserTitle = Regex.Replace(user.UserTitle, @"\)", @") "); // rank (spes)Last First (ama) => rank (spes) Last First (ama)

        return user;
    }

    /// <returns>(success, server message). The message is the service's SRV_MSG when the
    /// current-password check fails, or the exception text if the call itself blew up.</returns>
    public async Task<(bool Ok, string? Message)> ChangePasswordAsync(string username, string oldPassword, string newPassword,
        int category, string userIp)
    {
        using var client = CreateClient();
        using var des = new Simple3Des();
        var encryptedOld = des.EncryptData(oldPassword.Trim().Sanitize());
        var encryptedNew = des.EncryptData(newPassword.Trim().Sanitize());
        try
        {
            var user = await client.LogInAsync(category, username.Trim().Sanitize(), encryptedOld,
                _o.AppDbCode, B_DEBUG: false, userIp, WindowsUser);
            if (user.UserID <= 0)
                return (false, user.SRV_MSG);
            var ok = await client.ChangePassAsync(user.UserID, encryptedOld, encryptedNew);
            return (ok, null);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "MIS ChangePass failed for {User}", username);
            return (false, ex.Message);
        }
    }

    /// <summary>
    /// Κατηγορίες προσωπικού from the service (GetCategories). The service returns loose XML
    /// (ArrayOfXElement); each record element is expected to carry an integer id and a name.
    /// Empty list if the call fails or nothing parses (the raw XML is logged so the parser
    /// can be adjusted to the actual shape).
    /// </summary>
    public async Task<IReadOnlyList<MisCategory>> GetCategoriesAsync()
    {
        try
        {
            using var client = CreateClient();
            var result = await client.GetCategoriesAsync();
            var nodes = result?.Nodes ?? [];
            var parsed = ParseCategories(nodes);
            if (parsed.Count == 0)
                log.LogWarning("MIS GetCategories returned no parsable categories. Raw: {Xml}",
                    string.Concat(nodes.Select(n => n.ToString(SaveOptions.DisableFormatting))));
            return parsed;
        }
        catch (Exception ex)
        {
            log.LogError(ex, "MIS GetCategories failed");
            return [];
        }
    }

    private static List<MisCategory> ParseCategories(IEnumerable<XElement> nodes)
    {
        var list = new List<MisCategory>();
        foreach (var root in nodes)
        {
            // A "record" is an element whose children are all leaves (e.g. <Table><ID>1</ID><NAME>ΠΑ</NAME></Table>).
            var records = root.DescendantsAndSelf()
                .Where(e => e.HasElements && e.Elements().All(c => !c.HasElements));
            foreach (var rec in records)
            {
                var fields = rec.Elements().Select(e => e.Value.Trim()).ToList();
                var idText = fields.FirstOrDefault(v => int.TryParse(v, out _));
                var name = fields.FirstOrDefault(v => v.Length > 0 && !int.TryParse(v, out _));
                if (idText is null || name is null) continue;
                var id = int.Parse(idText);
                if (list.Any(c => c.Id == id)) continue;
                list.Add(new MisCategory(id, name));
            }
        }
        return list;
    }
}

file static class StringSanitizer
{
    // Copied verbatim from the wrapper: escape quotes, strip ';' and '--'.
    public static string Sanitize(this string input)
    {
        if (string.IsNullOrEmpty(input)) return input;
        input = input.Replace("'", "''");
        input = input.Replace("’", "’’");
        input = input.Replace(";", string.Empty);
        input = input.Replace("--", string.Empty);
        return input;
    }
}
