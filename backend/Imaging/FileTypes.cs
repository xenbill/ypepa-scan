namespace Mis.YpepaScan.Web.Imaging;

/// <summary>
/// File-type detection by magic numbers (the stored files have no name/extension).
/// Anything not in <see cref="Supported"/> can neither be imported nor viewed.
/// </summary>
public static class FileTypes
{
    /// <summary>Bytes needed to classify (ASCII DXF = "  0\r\nSECTION" with variable padding).</summary>
    public const int HeadLength = 32;

    /// <summary>
    /// Types the viewer can show: PDF natively, CAD via an Aspose.CAD raster,
    /// the rest via a libvips DZI pyramid.
    /// </summary>
    public static readonly IReadOnlySet<string> Supported =
        new HashSet<string> { "pdf", "tiff", "jpeg", "png", "gif", "bmp", "webp", "dwg", "dxf", "dgn", "dwf", "dwfx" };

    public const string SupportedLabels = "PDF, TIFF, JPEG, PNG, GIF, BMP, WebP, DWG, DXF, DGN, DWF";
    public const string SupportedLabelsNoCad = "PDF, TIFF, JPEG, PNG, GIF, BMP, WebP";

    // What the import file pickers offer (GET /api/config) — kept next to the
    // Supported set so the two cannot drift apart. The server sniffs content
    // anyway; extensions are only the browser-side filter.
    private const string AcceptBase = ".tif,.tiff,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp";
    private const string AcceptCad = ".dwg,.dxf,.dwt,.dgn,.dwf,.dwfx";
    public static string Accept(bool cadEnabled) => cadEnabled ? AcceptBase + "," + AcceptCad : AcceptBase;

    public static string Sniff(string path)
    {
        Span<byte> head = stackalloc byte[HeadLength];
        using var fs = File.OpenRead(path);
        return Resolve(Sniff(head[..fs.Read(head)]), fs);
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
        [0x41, 0x43, 0x31, 0x30, ..] => "dwg",                                              // AC10xx (all DWG since R11; also .dwt)
        [0x28, 0x44, 0x57, 0x46, 0x20, 0x56, ..] => "dwf",                                  // "(DWF V" (classic DWF)
        // Container formats; Resolve() upgrades them to dwfx/dgn by looking inside.
        [0x50, 0x4B, 0x03, 0x04, ..] => "zip",                                              // also docx/xlsx/dwfx
        [0xD0, 0xCF, 0x11, 0xE0, ..] => "ole",                                              // doc/xls (legacy Office), DGN v8
        _ when IsDgnV7(head) => "dgn",
        _ when IsDxf(head) => "dxf",
        _ => "unknown",
    };

    /// <summary>
    /// Container formats need a look past the head: DWFX is an OPC/ZIP package
    /// (telltale *.dwfseq entry) and DGN v8 an OLE compound file (streams named
    /// "Dgn~*"). Takes a seekable stream, restores its position; any parse failure
    /// just keeps the container type (=> rejected with the ZIP/Office message).
    /// </summary>
    public static string Resolve(string type, Stream s)
    {
        if (type is not ("zip" or "ole") || !s.CanSeek) return type;
        var pos = s.Position;
        try
        {
            return type switch
            {
                "zip" when IsDwfx(s) => "dwfx",
                "ole" when IsDgnV8(s) => "dgn",
                _ => type,
            };
        }
        finally
        {
            s.Position = pos;
        }
    }

    private static bool IsDwfx(Stream s)
    {
        try
        {
            s.Position = 0;
            using var zip = new System.IO.Compression.ZipArchive(s, System.IO.Compression.ZipArchiveMode.Read, leaveOpen: true);
            return zip.Entries.Any(e => e.FullName.EndsWith(".dwfseq", StringComparison.OrdinalIgnoreCase));
        }
        catch (Exception e) when (e is InvalidDataException or IOException)
        {
            return false;
        }
    }

    private static bool IsDgnV8(Stream s)
    {
        // Minimal OLE compound-file peek: header -> first directory sector -> entry
        // names (128-byte entries, UTF-16LE name first). DGN v8 keeps its data in
        // streams named "Dgn~..." (Dgn~H, Dgn~S, ...), created before anything else,
        // so they sit in the first directory sector. Word/Excel never match.
        try
        {
            Span<byte> header = stackalloc byte[76];
            s.Position = 0;
            if (s.ReadAtLeast(header, 76, throwOnEndOfStream: false) < 76) return false;
            int sectorSize = 1 << BitConverter.ToUInt16(header[30..32]);
            if (sectorSize is not (512 or 4096)) return false;
            uint firstDir = BitConverter.ToUInt32(header[48..52]);
            var sector = new byte[sectorSize];
            s.Position = (firstDir + 1L) * sectorSize;
            int n = s.ReadAtLeast(sector, sectorSize, throwOnEndOfStream: false);
            ReadOnlySpan<byte> dgnName = [(byte)'D', 0, (byte)'g', 0, (byte)'n', 0, (byte)'~', 0];
            for (int e = 0; e + 128 <= n; e += 128)
                if (sector.AsSpan(e, 8).SequenceEqual(dgnName))
                    return true;
            return false;
        }
        catch (IOException)
        {
            return false;
        }
    }

    /// <summary>
    /// DGN v7 (ISFF): first element header word masked with 0x3F73 equals 0x0801
    /// (design file or cell library) followed by the 0x02FE "words to follow" mark
    /// — the same test file(1) uses.
    /// </summary>
    private static bool IsDgnV7(ReadOnlySpan<byte> head) =>
        head.Length >= 4 && ((head[0] << 8 | head[1]) & 0x3F73) == 0x0801 && head[2] == 0xFE && head[3] == 0x02;

    /// <summary>
    /// DXF has no fixed magic: binary DXF opens with a sentinel string; ASCII DXF is a
    /// text file of group-code/value line pairs that starts with group 0 = SECTION.
    /// The ASCII check demands exactly that shape, so ordinary text files don't match.
    /// </summary>
    private static bool IsDxf(ReadOnlySpan<byte> head)
    {
        if (head.StartsWith("AutoCAD Binary DXF"u8)) return true;
        foreach (var b in head)
            if (b is not ((>= 0x20 and < 0x7F) or 0x09 or 0x0A or 0x0D)) return false;
        var lines = System.Text.Encoding.ASCII.GetString(head).Split('\n');
        return lines.Length >= 2 && lines[0].Trim() == "0" && lines[1].Trim() == "SECTION";
    }

    public static bool IsSupported(string type) => Supported.Contains(type);

    /// <summary>CAD vectors that go through the Aspose.CAD raster step before tiling.</summary>
    public static bool IsCad(string type) => type is "dwg" or "dxf" or "dgn" or "dwf" or "dwfx";

    /// <summary>Human label for messages / UI.</summary>
    public static string Label(string? type) => type switch
    {
        "pdf" => "PDF", "tiff" => "TIFF", "jpeg" => "JPEG", "png" => "PNG", "gif" => "GIF",
        "bmp" => "BMP", "webp" => "WebP", "dwg" => "DWG (AutoCAD)", "dxf" => "DXF (AutoCAD)",
        "dgn" => "DGN (MicroStation)", "dwf" => "DWF (Autodesk)", "dwfx" => "DWFX (Autodesk)",
        "zip" => "ZIP/Office", "ole" => "Word/Excel (παλαιό)", _ => "άγνωστος",
    };

    public static string UnsupportedMessage(string type, bool cadEnabled = true) =>
        $"Μη υποστηριζόμενος τύπος αρχείου ({Label(type)}). Επιτρέπονται: {(cadEnabled ? SupportedLabels : SupportedLabelsNoCad)}.";
}

/// <summary>Raised when a stored/uploaded file cannot be viewed (unsupported type or unreadable content).</summary>
public sealed class UnsupportedFileException(string type, string message) : Exception(message)
{
    public string FileType { get; } = type;
}
