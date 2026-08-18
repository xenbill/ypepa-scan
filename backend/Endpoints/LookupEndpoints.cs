using Sxedia.Web.Data;

namespace Sxedia.Web.Endpoints;

public sealed record LookupEditDto(string Name, long? ParentId);

/// <summary>Lookup lists and their administration (Μονάδες excluded: external COMMON data).</summary>
public static class LookupEndpoints
{
    public static RouteGroupBuilder MapLookupEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/lookups", (IDrawingStore store, CancellationToken ct) => store.GetLookupsAsync(ct));

        api.MapPost("/lookups/{type}", async (string type, LookupEditDto dto, IDrawingStore store, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name)) return Results.BadRequest(new { error = "Η περιγραφή είναι υποχρεωτική." });
            var id = await store.AddLookupAsync(type, dto.Name.Trim(), dto.ParentId, ct);
            return Results.Ok(new { id });
        });

        api.MapPut("/lookups/{type}/{id:long}", async (string type, long id, LookupEditDto dto, IDrawingStore store, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name)) return Results.BadRequest(new { error = "Η περιγραφή είναι υποχρεωτική." });
            return await store.UpdateLookupAsync(type, id, dto.Name.Trim(), dto.ParentId, ct)
                ? Results.Ok() : Results.NotFound();
        });

        api.MapDelete("/lookups/{type}/{id:long}", async (string type, long id, IDrawingStore store, CancellationToken ct) =>
        {
            try
            {
                return await store.DeleteLookupAsync(type, id, ct) ? Results.Ok() : Results.NotFound();
            }
            catch (LookupInUseException ex)
            {
                return Results.Conflict(new { error = ex.Message });
            }
        });

        return api;
    }
}
