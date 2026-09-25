namespace SampleVault.Api.Models;

public class SaveMelodicPresetRequest
{
    public Guid? Id { get; set; }

    public string Name { get; set; } =
        string.Empty;

    /*
      Frontend source kinds:
        library     -> SampleId
        temporary   -> TempId
        savedPreset -> SourcePresetId
    */
    public string SourceKind { get; set; } =
        string.Empty;

    public int? SampleId { get; set; }

    public string? TempId { get; set; }

    public Guid? SourcePresetId { get; set; }

    public string FileName { get; set; } =
        string.Empty;

    public double DurationSeconds { get; set; }

    public List<string> Tags { get; set; } = [];

    public int RootMidiNote { get; set; } = 60;

    public int TransposeSemitones { get; set; }

    public double FineTuneCents { get; set; }

    public string VoiceMode { get; set; } = "mono";

    public double GlideMs { get; set; } = 80;

    public bool LoopWhileHeld { get; set; } = true;

    public bool HasCustomLoop { get; set; }

    public double LoopStartSeconds { get; set; }

    public double LoopEndSeconds { get; set; }

    public bool LoopAutoSmooth { get; set; } = true;

    public double LoopCrossfadeMs { get; set; } = 8;

    public double AttackMs { get; set; }

    public double DecayMs { get; set; } = 180;

    public double SustainPercent { get; set; } = 100;

    public double ReleaseMs { get; set; } = 120;

    public double GainDb { get; set; }
}
