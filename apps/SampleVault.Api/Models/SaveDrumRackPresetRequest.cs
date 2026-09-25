namespace SampleVault.Api.Models;

public class SaveDrumRackPresetRequest
{
    public string Name { get; set; } =
        string.Empty;

    public List<SaveDrumRackSlotRequest> Slots
    {
        get;
        set;
    } = [];
}

public class SaveDrumRackSlotRequest
{
    public int SlotIndex { get; set; }

    public string SourceKind { get; set; } =
        string.Empty;

    public int? SampleId { get; set; }

    public string? TempId { get; set; }

    public int? RackAssetSlotId
    {
        get;
        set;
    }

    public string FileName { get; set; } =
        string.Empty;

    public double DurationSeconds
    {
        get;
        set;
    }

    public List<string> Tags { get; set; } =
        [];
}
