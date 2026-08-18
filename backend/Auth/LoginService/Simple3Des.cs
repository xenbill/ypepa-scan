using System.Security.Cryptography;
using System.Text;

namespace Sxedia.Web.Auth.LoginService;

/// <summary>
/// Password obfuscation expected by the MIS login service (copied from
/// Mis.Common.LoginServiceWrapper/Helpers/Simple3Des.cs). TripleDES/CBC/PKCS7 with a
/// SHA1-derived key from a fixed passphrase — same output as the original
/// TripleDESCryptoServiceProvider-based code, without the obsolete APIs.
/// </summary>
public sealed class Simple3Des : IDisposable
{
    private const string Key = "tasos.gr";
    private readonly TripleDES _tripleDes = TripleDES.Create();

    public Simple3Des()
    {
        _tripleDes.Key = TruncateHash(Key, _tripleDes.KeySize / 8);
        _tripleDes.IV = TruncateHash("", _tripleDes.BlockSize / 8);
    }

    private static byte[] TruncateHash(string key, int length)
    {
        var hash = SHA1.HashData(Encoding.Unicode.GetBytes(key));
        Array.Resize(ref hash, length);
        return hash;
    }

    public string EncryptData(string plaintext)
    {
        var bytes = Encoding.Unicode.GetBytes(plaintext);
        using var ms = new MemoryStream();
        using (var enc = new CryptoStream(ms, _tripleDes.CreateEncryptor(), CryptoStreamMode.Write))
        {
            enc.Write(bytes, 0, bytes.Length);
            enc.FlushFinalBlock();
        }
        return Convert.ToBase64String(ms.ToArray());
    }

    public string DecryptData(string encryptedText)
    {
        var bytes = Convert.FromBase64String(encryptedText);
        using var ms = new MemoryStream();
        using (var dec = new CryptoStream(ms, _tripleDes.CreateDecryptor(), CryptoStreamMode.Write))
        {
            dec.Write(bytes, 0, bytes.Length);
            dec.FlushFinalBlock();
        }
        return Encoding.Unicode.GetString(ms.ToArray());
    }

    public void Dispose() => _tripleDes.Dispose();
}
