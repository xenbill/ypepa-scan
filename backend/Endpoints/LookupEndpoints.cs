using Mis.YpepaScan.Web.Auth;
using Mis.YpepaScan.Web.Data;

namespace Mis.YpepaScan.Web.Endpoints;

public sealed record LookupEditDto(string Name, long? ParentId);

/// <summary>Lookup lists (everyone) and their administration (ADMIN right; Μονάδες excluded: external COMMON data).</summary>
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
        }).RequireAuthorization(AppRights.Admin);

        api.MapPut("/lookups/{type}/{id:long}", async (string type, long id, LookupEditDto dto, IDrawingStore store, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name)) return Results.BadRequest(new { error = "Η περιγραφή είναι υποχρεωτική." });
            return await store.UpdateLookupAsync(type, id, dto.Name.Trim(), dto.ParentId, ct)
                ? Results.Ok() : Results.NotFound();
        }).RequireAuthorization(AppRights.Admin);

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
        }).RequireAuthorization(AppRights.Admin);

        return api;
    }
}
