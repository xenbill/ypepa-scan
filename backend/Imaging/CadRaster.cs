using Aspose.CAD;
using Aspose.CAD.FileFormats.Cad;
using Aspose.CAD.ImageOptions;

namespace Mis.YpepaScan.Web.Imaging;

/// <summary>
/// Renders CAD files (DWG/DXF) to a raster PNG via Aspose.CAD so the normal DZI
/// pipeline can tile them. Rendering happens once per drawing (first view) and the
/// pyramid is cached like any other; the original stays in the store untouched.
/// The licence (Aspose:LicensePath) is applied once, lazily — without it Aspose
/// runs in evaluation mode and watermarks the output.
/// </summary>
public sealed class CadRaster
{
    private readonly ILogger<CadRaster> _log;
    private readonly int _longSide;
    private readonly Lazy<bool> _license;

    public CadRaster(IConfiguration cfg, ILogger<CadRaster> log)
    {
        _log = log;
        // Long side of the render in px. 6000 keeps small text legible at deep
        // zoom while bounding Aspose's transient render buffer (~6000²·4 ≈ 110 MB).
        _longSide = cfg.GetValue<int?>("Cad:RasterPixels") ?? 6000;
        var path = cfg["Aspose:LicensePath"];
        _license = new(() => LoadLicense(path), LazyThreadSafetyMode.ExecutionAndPublication);

        // Feature flag. Cad:Enabled turns the whole CAD feature on/off; with
        // Cad:RequireLicense=true it additionally turns itself off when the Aspose
        // licence file is missing (instead of the default: render with watermark).
        var enabled = cfg.GetValue<bool?>("Cad:Enabled") ?? true;
        if (enabled && (cfg.GetValue<bool?>("Cad:RequireLicense") ?? false)
                    && (string.IsNullOrWhiteSpace(path) || !File.Exists(path)))
        {
            log.LogWarning("CAD support disabled: Cad:RequireLicense is set and no Aspose licence file exists at {Path}",
                string.IsNullOrWhiteSpace(path) ? "(unset)" : path);
            enabled = false;
        }
        Enabled = enabled;
    }

    /// <summary>Whether CAD files are accepted and viewable at all (see ctor).</summary>
    public bool Enabled { get; }

    private bool LoadLicense(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            _log.LogWarning("Aspose:LicensePath is not set — CAD rendering runs in evaluation mode (watermarked output)");
            return false;
        }
        try
        {
            new License().SetLicense(path);
            _log.LogInformation("Aspose.CAD licence loaded from {Path}", path);
            return true;
        }
        catch (Exception e)
        {
            _log.LogError(e, "Aspose.CAD licence could not be loaded from {Path} — evaluation mode (watermarked output)", path);
            return false;
        }
    }

    /// <summary>
    /// Renders the CAD file (model space, white background, entity colours) to a
    /// PNG at dstPath. Throws when Aspose cannot decode the file.
    /// </summary>
    public void Render(string srcPath, string dstPath)
    {
        _ = _license.Value;
        using var img = Aspose.CAD.Image.Load(srcPath);
        // img.Width/Height come from the drawing's extents (drawing units) — only
        // the aspect ratio matters; scale the long side to _longSide pixels.
        var scale = (double)_longSide / Math.Max(Math.Max(img.Width, img.Height), 1);
        var raster = new CadRasterizationOptions
        {
            PageWidth = (float)Math.Max(img.Width * scale, 1),
            PageHeight = (float)Math.Max(img.Height * scale, 1),
            BackgroundColor = Color.White,
            DrawType = CadDrawTypeMode.UseObjectColor,
        };
        img.Save(dstPath, new PngOptions { VectorRasterizationOptions = raster });
    }
}
