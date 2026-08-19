namespace Sxedia.Web.Imaging;

/// <summary>
/// File-type detection by magic numbers (the stored files have no name/extension).
/// Anything not in <see cref="Supported"/> can neither be imported nor viewed.
/// </summary>
public static class FileTypes
{
    /// <summary>Bytes needed to classify (WebP = "RIFF" + size + "WEBP" needs 12).</summary>
    public const int HeadLength = 12;

    /// <summary>Types the viewer can show: PDF natively, the rest via a libvips DZI pyramid.</summary>
    public static readonly IReadOnlySet<string> Supported =
        new HashSet<string> { "pdf", "tiff", "jpeg", "png", "gif", "bmp", "webp" };

    public const string SupportedLabels = "PDF, TIFF, JPEG, PNG, GIF, BMP, WebP";

    public static string Sniff(string path)
    {
        Span<byte> head = stackalloc byte[HeadLength];
        using var fs = File.OpenRead(path);
        return Sniff(head[..fs.Read(head)]);
    }

    /// <summary>Classifies by the first bytes. Unrecognised (or too short) => "unknown".</summary>
    public static string Sniff(ReadOnlySpan<byte> head) => head switch
    {
        [0x25, 0x50, 0x44, 0x46, ..] => "pdf",                                              // %PDF
        [0x49, 0x49, 0x2A, 0x00, ..] or [0x4D, 0x4D, 0x00, 0x2A, ..] => "tiff",              // II*\0 / MM\0*
        [0xFF, 0xD8, 0xFF, ..] => "jpeg",
        [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ..] => "png",
        [0x47, 0x49, 0x46, 0x38, ..] => "gif",                                              // GIF8
        [0x42, 0x4D, ..] => "bmp",                                                          // BM
        [0x52, 0x49, 0x46, 0x46, _, _, _, _, 0x57, 0x45, 0x42, 0x50, ..] => "webp",         // RIFF....WEBP
        // Recognised but not viewable — named so the user gets a meaningful message.
        [0x41, 0x43, 0x31, 0x30, ..] => "dwg",                                              // AC10xx
        [0x50, 0x4B, 0x03, 0x04, ..] => "zip",                                              // also docx/xlsx
        [0xD0, 0xCF, 0x11, 0xE0, ..] => "ole",                                              // doc/xls (legacy Office)
        _ => "unknown",
    };

    public static bool IsSupported(string type) => Supported.Contains(type);

    /// <summary>Human label for messages / UI.</summary>
    public static string Label(string? type) => type switch
    {
        "pdf" => "PDF", "tiff" => "TIFF", "jpeg" => "JPEG", "png" => "PNG", "gif" => "GIF",
        "bmp" => "BMP", "webp" => "WebP", "dwg" => "DWG (AutoCAD)", "zip" => "ZIP/Office",
        "ole" => "Word/Excel (παλαιό)", _ => "άγνωστος",
    };

    public static string UnsupportedMessage(string type) =>
        $"Μη υποστηριζόμενος τύπος αρχείου ({Label(type)}). Επιτρέπονται: {SupportedLabels}.";
}

/// <summary>Raised when a stored/uploaded file cannot be viewed (unsupported type or unreadable content).</summary>
public sealed class UnsupportedFileException(string type, string message) : Exception(message)
{
    public string FileType { get; } = type;
}
