using System.Text.Json;
using NetVips;

namespace Mis.YpepaScan.Web.Data;

/// <summary>
/// Creates sample data for demo mode: lookup tables, a handful of drawing records
/// and synthetic 10000x15000 bilevel TIFFs (the size class of the real scans).
/// </summary>
public static class DemoSeeder
{
    public static void Seed(string dir)
    {
        Directory.CreateDirectory(Path.Combine(dir, "files"));

        var db = new
        {
            EidosSxed = new[]
            {
                new Lookup(1, "Αρχιτεκτονικό"), new Lookup(2, "Στατικό"),
                new Lookup(3, "Ηλεκτρομηχανολογικό"), new Lookup(4, "Τοπογραφικό"),
            },
            KathgoriaErg = new[]
            {
                new Lookup(1, "Κτιριακά Έργα"), new Lookup(2, "Υποδομές"), new Lookup(3, "Η/Μ Εγκαταστάσεις"),
            },
            YpokatErg = new[]
            {
                new Lookup(1, "Γραφεία", 1), new Lookup(2, "Υπόστεγα", 1),
                new Lookup(3, "Οδοποιία", 2), new Lookup(4, "Δίκτυα", 2),
                new Lookup(5, "Υποσταθμοί", 3),
            },
            XorosApoth = new[]
            {
                new Lookup(1, "Αρχειοθήκη Α"), new Lookup(2, "Αρχειοθήκη Β"), new Lookup(3, "Σχεδιοθήκη 3"),
            },
            // Stand-in for COMMON.G11HAF_STRUCTURE (HSTR_ID / TITLE)
            Monada = new[]
            {
                new Lookup(101, "Μονάδα Α"), new Lookup(102, "Μονάδα Β"), new Lookup(103, "Κεντρική Διοίκηση"),
                new Lookup(104, "Τμήμα Μελετών (υπομονάδα)"),
            },
            // Only top-level units are offered on create/edit; 104 stands in for a sub-unit
            // that exists on old rows but is not in the dropdown.
            MonadaEditIds = new List<long> { 101, 102, 103 },
            Drawings = new[]
            {
                new DemoDrawingStore.DemoRow { SxedioId = 1, KodikosErg = "ΕΡΓ-2003-014", ArithmosSxed = "Α-014-01",
                    TitlosErg = "Ανακαίνιση Κτιρίου Διοίκησης", TitlosSxed = "Κάτοψη Ισογείου",
                    PerigrafhSxed = "Κάτοψη ισογείου με διαρρύθμιση γραφείων", Hmer = new DateTime(2003, 5, 12),
                    EidosId = 1, KathgId = 1, YpokatId = 1, XorosId = 1, HstrId = 101, DateIns = new DateTime(2003, 5, 20), UserIns = "DEMO" },
                new DemoDrawingStore.DemoRow { SxedioId = 2, KodikosErg = "ΕΡΓ-2003-014", ArithmosSxed = "Σ-014-02",
                    TitlosErg = "Ανακαίνιση Κτιρίου Διοίκησης", TitlosSxed = "Ξυλότυπος Οροφής",
                    PerigrafhSxed = "Στατικό σχέδιο οροφής ισογείου", Hmer = new DateTime(2003, 6, 2),
                    EidosId = 2, KathgId = 1, YpokatId = 1, XorosId = 1, HstrId = 101, DateIns = new DateTime(2003, 6, 10), UserIns = "DEMO" },
                new DemoDrawingStore.DemoRow { SxedioId = 3, KodikosErg = "ΕΡΓ-2010-102", ArithmosSxed = "ΗΜ-102-07",
                    TitlosErg = "Νέος Υποσταθμός ΜΤ", TitlosSxed = "Μονογραμμικό Διάγραμμα",
                    PerigrafhSxed = "Ηλεκτρολογικό μονογραμμικό πίνακα ΜΤ/ΧΤ", Hmer = new DateTime(2010, 11, 25),
                    EidosId = 3, KathgId = 3, YpokatId = 5, XorosId = 2, HstrId = 102, DateIns = new DateTime(2010, 12, 1), UserIns = "DEMO" },
                new DemoDrawingStore.DemoRow { SxedioId = 4, KodikosErg = "ΕΡΓ-2015-033", ArithmosSxed = "Τ-033-01",
                    TitlosErg = "Επέκταση Τροχοδρόμου", TitlosSxed = "Οριζοντιογραφία",
                    PerigrafhSxed = "Τοπογραφικό διάγραμμα ζώνης επέκτασης", Hmer = new DateTime(2015, 3, 18),
                    EidosId = 4, KathgId = 2, YpokatId = 3, XorosId = 3, HstrId = 104, DateIns = new DateTime(2015, 3, 30), UserIns = "DEMO" },
            },
        };

        File.WriteAllText(Path.Combine(dir, "demo.json"),
            JsonSerializer.Serialize(db, new JsonSerializerOptions { WriteIndented = true }));

        foreach (var d in db.Drawings)
        {
            var path = Path.Combine(dir, "files", $"{d.SxedioId}.tif");
            if (!File.Exists(path))
                GenerateTiff(path, seed: (int)d.SxedioId);
        }
    }

    /// <summary>Synthetic "engineering drawing": frame, title block, walls, columns, hatching.</summary>
    private static void GenerateTiff(string path, int seed)
    {
        const int W = 10000, H = 15000;
        var rnd = new Random(seed);
        double[] black = [0.0];
        double[] white = [255.0];

        using var img = (Image.Black(W, H) + 255).Cast(Enums.BandFormat.Uchar).Mutate(m =>
        {
            void ThickRect(int x, int y, int w, int h, int t)
            {
                m.DrawRect(black, x, y, w, t, fill: true);
                m.DrawRect(black, x, y + h - t, w, t, fill: true);
                m.DrawRect(black, x, y, t, h, fill: true);
                m.DrawRect(black, x + w - t, y, t, h, fill: true);
            }

            // Sheet frame + title block (bottom right)
            ThickRect(150, 150, W - 300, H - 300, 25);
            ThickRect(W - 3200, H - 1400, 3050, 1250, 20);
            for (var i = 1; i < 5; i++)
                m.DrawRect(black, W - 3200, H - 1400 + i * 250, 3050, 8, fill: true);
            m.DrawRect(black, W - 2200, H - 1400, 8, 1250, fill: true);

            // "Walls": grid with random openings
            const int margin = 600;
            int cols = 5 + seed % 3, rows = 7 + seed % 2;
            int cw = (W - 2 * margin) / cols, rh = (H - 2 * margin - 1600) / rows;
            for (var c = 0; c <= cols; c++)
                for (var r = 0; r < rows; r++)
                    if (rnd.NextDouble() > 0.25)
                        m.DrawRect(black, margin + c * cw, margin + r * rh, 30, rh - (rnd.NextDouble() > 0.7 ? 400 : 0), fill: true);
            for (var r = 0; r <= rows; r++)
                for (var c = 0; c < cols; c++)
                    if (rnd.NextDouble() > 0.25)
                        m.DrawRect(black, margin + c * cw + (rnd.NextDouble() > 0.7 ? 350 : 0), margin + r * rh, cw, 30, fill: true);

            // "Columns"
            for (var c = 0; c <= cols; c++)
                for (var r = 0; r <= rows; r++)
                    m.DrawCircle(black, margin + c * cw + 15, margin + r * rh + 15, 60, fill: true);

            // Diagonal hatching in a few random rooms
            for (var k = 0; k < 6; k++)
            {
                int c = rnd.Next(cols), r = rnd.Next(rows);
                int x0 = margin + c * cw, y0 = margin + r * rh;
                for (var o = 0; o < cw + rh; o += 120)
                {
                    int x1 = Math.Max(x0, x0 + o - rh), y1 = Math.Min(y0 + rh, y0 + o);
                    int x2 = Math.Min(x0 + cw, x0 + o), y2 = Math.Max(y0, y0 + o - cw);
                    m.DrawLine(black, x1, y1, x2, y2);
                }
            }

            // Dimension-like ticks along the top
            for (var x = margin; x < W - margin; x += cw / 4)
                m.DrawRect(black, x, 400, 6, 120, fill: true);
        });

        try
        {
            img.Tiffsave(path, compression: Enums.ForeignTiffCompression.Ccittfax4, bitdepth: 1,
                xres: 200 / 25.4, yres: 200 / 25.4);
        }
        catch (VipsException)
        {
            img.Tiffsave(path, compression: Enums.ForeignTiffCompression.Lzw);
        }
    }
}
