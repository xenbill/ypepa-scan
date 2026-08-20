using System.Buffers.Binary;
using System.Text;

namespace Mis.YpepaScan.Web.Imaging;

/// <summary>
/// Minimal TIFF header/IFD reader used purely for diagnostics: when a TIFF fails
/// every decoder, we log what the file *claims* to be (compression, photometric,
/// sample layout, page count, old-JPEG specifics) so failures on servers we cannot
/// pull files from remain debuggable from the log alone. Reads only tag data —
/// never image data. Never throws: any parse problem becomes part of the text.
/// </summary>
public static class TiffDiag
{
    public static string Describe(string path)
    {
        try { return DescribeCore(path); }
        catch (Exception e) { return $"(tiff-diag failed: {e.GetType().Name}: {e.Message})"; }
    }

    /// <summary>
    /// Old-style JPEG TIFFs (compression 6) usually wrap one complete JPEG
    /// interchange stream (tags 513/514). libtiff's OJPEG shim rejects many of
    /// them over tag-vs-stream contradictions — but the stream itself is
    /// self-describing and decodes cleanly on its own. Copies it to
    /// <paramref name="dstPath"/>; false when the file is not that shape.
    /// </summary>
    public static bool TryExtractOldJpeg(string srcPath, string dstPath)
    {
        try
        {
            using var fs = File.OpenRead(srcPath);
            var hdr = new byte[8];
            if (fs.Read(hdr, 0, 8) != 8) return false;
            var le = hdr[0] == (byte)'I' && hdr[1] == (byte)'I';
            if (!le && !(hdr[0] == (byte)'M' && hdr[1] == (byte)'M')) return false;
            if (U16(hdr.AsSpan(2, 2), le) != 42) return false;
            var ifd = U32(hdr.AsSpan(4, 4), le);
            if (ifd > fs.Length - 2) return false;
            fs.Seek(ifd, SeekOrigin.Begin);
            var cntBuf = new byte[2];
            if (fs.Read(cntBuf, 0, 2) != 2) return false;
            int n = U16(cntBuf, le);
            if (n == 0 || n > 512) return false;
            var entries = new byte[n * 12];
            if (fs.Read(entries, 0, entries.Length) != entries.Length) return false;

            ulong compression = 0, jifOffset = 0, jifLength = 0;
            for (var i = 0; i < n; i++)
            {
                var e = entries.AsSpan(i * 12, 12);
                var tag = U16(e[..2], le);
                if (tag is not (259 or 513 or 514)) continue;
                var type = U16(e.Slice(2, 2), le);
                if (U32(e.Slice(4, 4), le) != 1) continue;
                var val = type switch { 3 => (ulong)U16(e.Slice(8, 2), le), 4 => U32(e.Slice(8, 4), le), _ => 0UL };
                if (tag == 259) compression = val;
                else if (tag == 513) jifOffset = val;
                else jifLength = val;
            }
            if (compression != 6 || jifOffset == 0 || jifOffset >= (ulong)fs.Length) return false;

            // A wrong/absent length degrades to "until EOF" — the stream carries
            // its own end marker, decoders just stop there.
            var available = (ulong)fs.Length - jifOffset;
            var len = jifLength == 0 ? available : Math.Min(jifLength, available);
            fs.Seek((long)jifOffset, SeekOrigin.Begin);
            var soi = new byte[2];
            if (fs.Read(soi, 0, 2) != 2 || soi[0] != 0xFF || soi[1] != 0xD8) return false; // no JPEG SOI marker

            fs.Seek((long)jifOffset, SeekOrigin.Begin);
            using var dst = File.Create(dstPath);
            var buf = new byte[1 << 20];
            for (var remaining = (long)len; remaining > 0;)
            {
                var r = fs.Read(buf, 0, (int)Math.Min(buf.Length, remaining));
                if (r <= 0) break;
                dst.Write(buf, 0, r);
                remaining -= r;
            }
            return true;
        }
        catch
        {
            return false; // any surprise = "not extractable", the next fallback runs
        }
    }

    private static string DescribeCore(string path)
    {
        using var fs = File.OpenRead(path);
        var hdr = new byte[8];
        if (fs.Read(hdr, 0, 8) != 8) return "(file shorter than a TIFF header)";
        var le = hdr[0] == (byte)'I' && hdr[1] == (byte)'I';
        var be = hdr[0] == (byte)'M' && hdr[1] == (byte)'M';
        if (!le && !be) return "(no II/MM byte-order marker — not a TIFF)";
        if (U16(hdr.AsSpan(2, 2), le) != 42) return "(magic != 42 — not a classic TIFF)";

        var sb = new StringBuilder(le ? "II little-endian" : "MM big-endian");

        // Walk the IFD chain: describe the first page, count the rest (bounded —
        // a corrupt next-pointer must not loop us forever).
        var ifdOffset = U32(hdr.AsSpan(4, 4), le);
        var pages = 0;
        while (ifdOffset != 0 && pages < 100)
        {
            if (ifdOffset > fs.Length - 2) { sb.Append($"; (IFD offset {ifdOffset} beyond EOF)"); break; }
            fs.Seek(ifdOffset, SeekOrigin.Begin);
            var cntBuf = new byte[2];
            if (fs.Read(cntBuf, 0, 2) != 2) break;
            int n = U16(cntBuf, le);
            if (n == 0 || n > 512) { sb.Append($"; (IFD with {n} entries — implausible)"); break; }
            var entries = new byte[n * 12 + 4];
            if (fs.Read(entries, 0, entries.Length) != entries.Length) { sb.Append("; (truncated IFD)"); break; }

            if (pages == 0)
                DescribeFirstPage(sb, fs, entries.AsSpan(0, n * 12), le);
            pages++;
            ifdOffset = U32(entries.AsSpan(n * 12, 4), le);
        }
        sb.Append($"; pages={pages}{(ifdOffset != 0 ? "+" : "")}");
        return sb.ToString();
    }

    private static void DescribeFirstPage(StringBuilder sb, FileStream fs, ReadOnlySpan<byte> entries, bool le)
    {
        // tag -> up to 4 numeric values (enough for every tag we report on)
        var tags = new Dictionary<ushort, ulong[]>();
        for (var i = 0; i + 12 <= entries.Length; i += 12)
        {
            var e = entries.Slice(i, 12);
            var tag = U16(e[..2], le);
            var type = U16(e.Slice(2, 2), le);
            var count = U32(e.Slice(4, 4), le);
            var size = type switch { 1 => 1, 2 => 1, 3 => 2, 4 => 4, _ => 0 }; // BYTE/ASCII/SHORT/LONG
            if (size == 0 || count == 0) continue;
            var take = (int)Math.Min(count, 4);
            var vals = new ulong[take];
            var total = size * count;
            if (total <= 4)
            {
                for (var k = 0; k < take; k++) vals[k] = ReadVal(e.Slice(8 + k * size, size), le);
            }
            else
            {
                var off = U32(e.Slice(8, 4), le);
                if (off + size * (uint)take > fs.Length) continue;
                var pos = fs.Position;
                fs.Seek(off, SeekOrigin.Begin);
                var buf = new byte[size * take];
                if (fs.Read(buf, 0, buf.Length) == buf.Length)
                    for (var k = 0; k < take; k++) vals[k] = ReadVal(buf.AsSpan(k * size, size), le);
                fs.Seek(pos, SeekOrigin.Begin);
            }
            tags[tag] = vals;
            // stash the full count for strip/tile counting
            if (tag is 273 or 324) tags[(ushort)(tag + 10000)] = [count];
        }

        ulong? V(ushort t) => tags.TryGetValue(t, out var v) ? v[0] : null;
        string List(ushort t) => tags.TryGetValue(t, out var v) ? string.Join(",", v) : "?";

        sb.Append($"; page1: {V(256)?.ToString() ?? "?"}x{V(257)?.ToString() ?? "?"} px");
        var comp = V(259);
        sb.Append($", compression={comp?.ToString() ?? "?"}{Name(comp, CompressionNames)}");
        var phot = V(262);
        sb.Append($", photometric={phot?.ToString() ?? "?"}{Name(phot, PhotometricNames)}");
        sb.Append($", samples/pixel={V(277)?.ToString() ?? "?"}");
        sb.Append($", bits/sample={List(258)}");
        if (V(284) is { } planar && planar != 1) sb.Append($", planar={planar}");
        if (V(278) is { } rps) sb.Append($", rows/strip={rps}");
        if (tags.TryGetValue(273 + 10000, out var sc)) sb.Append($", strips={sc[0]}");
        if (tags.TryGetValue(324 + 10000, out var tc)) sb.Append($", tiles={tc[0]} ({V(322)}x{V(323)})");
        if (V(530) is not null) sb.Append($", YCbCrSubSampling={List(530)}");
        // Old-style JPEG (compression 6) specifics — these are what libtiff's
        // OJPEG shim trips over when they contradict the tags above.
        if (V(512) is { } proc) sb.Append($", JPEGProc={proc}");
        if (V(513) is { } jif) sb.Append($", JPEGInterchangeFormat@{jif} len={V(514)?.ToString() ?? "?"}");
        if (V(519) is not null) sb.Append(", JPEGQTables present");
        if (V(520) is not null) sb.Append(", JPEGDCTables present");
        if (V(521) is not null) sb.Append(", JPEGACTables present");
    }

    private static ulong ReadVal(ReadOnlySpan<byte> s, bool le) => s.Length switch
    {
        1 => s[0],
        2 => U16(s, le),
        _ => U32(s, le),
    };

    private static ushort U16(ReadOnlySpan<byte> s, bool le)
        => le ? BinaryPrimitives.ReadUInt16LittleEndian(s) : BinaryPrimitives.ReadUInt16BigEndian(s);

    private static uint U32(ReadOnlySpan<byte> s, bool le)
        => le ? BinaryPrimitives.ReadUInt32LittleEndian(s) : BinaryPrimitives.ReadUInt32BigEndian(s);

    private static string Name(ulong? v, Dictionary<ulong, string> names)
        => v is { } x && names.TryGetValue(x, out var n) ? $" ({n})" : "";

    private static readonly Dictionary<ulong, string> CompressionNames = new()
    {
        [1] = "none", [2] = "CCITT RLE", [3] = "CCITT G3", [4] = "CCITT G4", [5] = "LZW",
        [6] = "JPEG old-style", [7] = "JPEG", [8] = "Deflate", [32773] = "PackBits", [32946] = "Deflate",
    };

    private static readonly Dictionary<ulong, string> PhotometricNames = new()
    {
        [0] = "WhiteIsZero", [1] = "BlackIsZero", [2] = "RGB", [3] = "Palette", [5] = "CMYK", [6] = "YCbCr",
    };
}
