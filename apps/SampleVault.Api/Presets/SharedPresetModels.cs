namespace SampleVault.Api.Presets;

/// <summary>
/// Versioned file format shared between the .NET app and the future
/// JUCE VST3. Keep these models intentionally plain and portable.
/// </summary>
public static class SampleVaultPresetFormat
{
    public const int CurrentVersion = 1;
}

public sealed class AudioSourceRef
{
    /// <summary>
    /// "externalFile" = an existing Library WAV on disk.
    /// "managedAsset" = a private SampleVault asset copied into
    /// %LOCALAPPDATA%\SampleVault\Assets.
    /// </summary>
    public string Kind { get; set; } = "externalFile";

    /// <summary>
    /// For externalFile this may be absolute.
    /// For managedAsset this is relative to the SampleVault root,
    /// e.g. "Assets/9b0....wav".
    /// </summary>
    public string Path { get; set; } = string.Empty;
}

public sealed class LoopSettings
{
    public bool Enabled { get; set; }

    public double StartSeconds { get; set; }
    public double EndSeconds { get; set; }

    public bool AutoSmooth { get; set; } = true;
    public double CrossfadeMs { get; set; } = 8;
}

public sealed class AmpEnvelopeSettings
{
    public double AttackMs { get; set; }
    public double DecayMs { get; set; } = 180;
    public double Sustain { get; set; } = 1.0;
    public double ReleaseMs { get; set; } = 120;
}

public sealed class MelodicPresetFile
{
    public int Version { get; set; } =
        SampleVaultPresetFormat.CurrentVersion;

    public string Type { get; set; } = "melodic";

    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;

    public DateTime UpdatedAtUtc { get; set; } =
        DateTime.UtcNow;

    public AudioSourceRef Audio { get; set; } = new();

    /*
      Display metadata is stored in the preset so the VST and
      desktop app do not need SQLite just to show the sound.
    */
    public string FileName { get; set; } = string.Empty;
    public double DurationSeconds { get; set; }
    public List<string> Tags { get; set; } = [];

    public int RootMidiNote { get; set; } = 60;

    public int TransposeSemitones { get; set; }
    public double FineTuneCents { get; set; }

    public string VoiceMode { get; set; } = "mono";
    public double GlideMs { get; set; } = 80;

    public bool LoopWhileHeld { get; set; } = true;
    public LoopSettings Loop { get; set; } = new();

    public AmpEnvelopeSettings AmpEnvelope { get; set; } = new();

    public double GainDb { get; set; }
}

public sealed class DrumRackSlotFile
{
    public int SlotIndex { get; set; }

    public AudioSourceRef Audio { get; set; } = new();

    public string FileName { get; set; } = string.Empty;

    public double DurationSeconds { get; set; }

    public List<string> Tags { get; set; } = [];
}

public sealed class DrumRackPresetFile
{
    public int Version { get; set; } =
        SampleVaultPresetFormat.CurrentVersion;

    public string Type { get; set; } = "drumRack";

    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;

    public DateTime UpdatedAtUtc { get; set; } =
        DateTime.UtcNow;

    public List<DrumRackSlotFile> Slots { get; set; } = [];
}
