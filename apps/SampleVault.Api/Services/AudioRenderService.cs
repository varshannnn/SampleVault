using NAudio.Wave;

namespace SampleVault.Api.Services;

public class AudioRenderService
{
    private readonly string _renderFolder;
    private readonly string _tempRenderFolder;
    private readonly string _rackCacheFolder;

    public AudioRenderService(
        IWebHostEnvironment environment)
    {
        _renderFolder =
            Path.Combine(
                environment.ContentRootPath,
                "renders");

        _tempRenderFolder =
            Path.Combine(
                environment.ContentRootPath,
                "temp-renders");

        _rackCacheFolder =
            Path.Combine(
                environment.ContentRootPath,
                "rack-cache");
    }

    /*
      The low-latency Drum Rack uses Web Audio's
      decodeAudioData(). Some imported WAV files
      can use encodings that decodeAudioData does
      not consistently accept even though the
      browser's normal <audio> element can play them.

      Normalize Library sounds to a standard
      16-bit PCM WAV once and cache the result.
    */
    public string GetOrCreateRackAudio(
        string sourcePath,
        int sampleId)
    {
        if (!File.Exists(sourcePath))
        {
            throw new FileNotFoundException(
                "Source audio file does not exist.",
                sourcePath);
        }

        Directory.CreateDirectory(
            _rackCacheFolder);

        long sourceStamp =
            File.GetLastWriteTimeUtc(
                sourcePath)
            .Ticks;

        string outputPath =
            Path.Combine(
                _rackCacheFolder,
                $"{sampleId}-{sourceStamp}.wav");

        if (File.Exists(outputPath))
        {
            return outputPath;
        }

        /*
          Remove older cached versions for this
          sample in case the source changed.
        */
        foreach (
            string oldPath in
            Directory.EnumerateFiles(
                _rackCacheFolder,
                $"{sampleId}-*.wav")
        )
        {
            try
            {
                File.Delete(oldPath);
            }
            catch
            {
                // A stale cache file is harmless.
            }
        }

        using var reader =
            new AudioFileReader(
                sourcePath);

        WaveFileWriter.CreateWaveFile16(
            outputPath,
            reader);

        return outputPath;
    }

    public string RenderSample(
        string sourcePath,
        double startTime,
        double endTime,
        bool reverse)
    {
        Directory.CreateDirectory(
            _renderFolder);

        string originalName =
            Path.GetFileNameWithoutExtension(
                sourcePath);

        string timestamp =
            DateTime.Now.ToString(
                "yyyyMMdd-HHmmssfff");

        string effectName =
            reverse
                ? "trim-reverse"
                : "trim";

        string outputPath =
            Path.Combine(
                _renderFolder,
                $"{originalName}-{effectName}-{timestamp}.wav");

        RenderToPath(
            sourcePath,
            outputPath,
            startTime,
            endTime,
            reverse);

        return outputPath;
    }

    /*
      Render a Lab edit for rack use without
      adding it to the Samples database.

      The GUID is what the frontend keeps.
      The real filename stays internal.
    */
    public (
        string TempId,
        string OutputPath
    ) RenderTemporarySample(
        string sourcePath,
        double startTime,
        double endTime,
        bool reverse)
    {
        Directory.CreateDirectory(
            _tempRenderFolder);

        CleanupOldTemporaryRenders();

        string tempId =
            Guid.NewGuid()
                .ToString("N");

        string outputPath =
            Path.Combine(
                _tempRenderFolder,
                $"{tempId}.wav");

        RenderToPath(
            sourcePath,
            outputPath,
            startTime,
            endTime,
            reverse);

        return (
            tempId,
            outputPath
        );
    }

    public string GetTemporarySamplePath(
        string tempId)
    {
        if (
            !Guid.TryParseExact(
                tempId,
                "N",
                out _)
        )
        {
            throw new ArgumentException(
                "Invalid temporary sample ID.");
        }

        return Path.Combine(
            _tempRenderFolder,
            $"{tempId}.wav");
    }

    public bool DeleteTemporarySample(
        string tempId)
    {
        string path =
            GetTemporarySamplePath(
                tempId);

        if (!File.Exists(path))
        {
            return false;
        }

        File.Delete(path);

        return true;
    }

    /*
      Temp rack renders are scratch audio.
      Anything abandoned for over a day can
      safely be removed.
    */
    private void CleanupOldTemporaryRenders()
    {
        if (
            !Directory.Exists(
                _tempRenderFolder)
        )
        {
            return;
        }

        DateTime cutoff =
            DateTime.UtcNow
                .AddHours(-24);

        foreach (
            string filePath in
            Directory.EnumerateFiles(
                _tempRenderFolder,
                "*.wav")
        )
        {
            try
            {
                DateTime lastWrite =
                    File.GetLastWriteTimeUtc(
                        filePath);

                if (lastWrite < cutoff)
                {
                    File.Delete(
                        filePath);
                }
            }
            catch
            {
                /*
                  Scratch cleanup should never
                  break normal rendering.
                */
            }
        }
    }

    private static void RenderToPath(
        string sourcePath,
        string outputPath,
        double startTime,
        double endTime,
        bool reverse)
    {
        if (!File.Exists(sourcePath))
        {
            throw new FileNotFoundException(
                "Source audio file does not exist.",
                sourcePath);
        }

        using var reader =
            new AudioFileReader(
                sourcePath);

        double duration =
            reader.TotalTime.TotalSeconds;

        startTime =
            Math.Clamp(
                startTime,
                0,
                duration);

        endTime =
            Math.Clamp(
                endTime,
                0,
                duration);

        if (endTime <= startTime)
        {
            throw new ArgumentException(
                "End time must be after start time.");
        }

        int channels =
            reader.WaveFormat.Channels;

        int sampleRate =
            reader.WaveFormat.SampleRate;

        reader.CurrentTime =
            TimeSpan.FromSeconds(
                startTime);

        long targetFrames =
            (long)Math.Ceiling(
                (endTime - startTime) *
                sampleRate);

        long targetSampleCount =
            targetFrames *
            channels;

        if (
            targetSampleCount >
            int.MaxValue
        )
        {
            throw new ArgumentException(
                "Selected audio is too large to render.");
        }

        var audio =
            new float[
                (int)targetSampleCount
            ];

        int position = 0;

        while (
            position <
            audio.Length
        )
        {
            int samplesRead =
                reader.Read(
                    audio.AsSpan(
                        position));

            if (samplesRead <= 0)
            {
                break;
            }

            position +=
                samplesRead;
        }

        if (
            position <
            audio.Length
        )
        {
            Array.Resize(
                ref audio,
                position);
        }

        if (reverse)
        {
            ReverseFrames(
                audio,
                channels);
        }

        var provider =
            new ArraySampleProvider(
                audio,
                reader.WaveFormat);

        WaveFileWriter.CreateWaveFile16(
            outputPath,
            provider);
    }

    private static void ReverseFrames(
        float[] samples,
        int channels)
    {
        if (channels <= 0)
        {
            return;
        }

        int frameCount =
            samples.Length /
            channels;

        int left = 0;
        int right =
            frameCount - 1;

        while (left < right)
        {
            for (
                int channel = 0;
                channel < channels;
                channel++)
            {
                int leftIndex =
                    left *
                    channels +
                    channel;

                int rightIndex =
                    right *
                    channels +
                    channel;

                (
                    samples[leftIndex],
                    samples[rightIndex]
                ) =
                (
                    samples[rightIndex],
                    samples[leftIndex]
                );
            }

            left++;
            right--;
        }
    }

    private sealed class ArraySampleProvider
        : ISampleProvider
    {
        private readonly float[] _samples;
        private int _position;

        public WaveFormat WaveFormat
        {
            get;
        }

        public ArraySampleProvider(
            float[] samples,
            WaveFormat waveFormat)
        {
            _samples = samples;
            WaveFormat = waveFormat;
        }

        public int Read(
            Span<float> buffer)
        {
            int remaining =
                _samples.Length -
                _position;

            int count =
                Math.Min(
                    remaining,
                    buffer.Length);

            if (count <= 0)
            {
                return 0;
            }

            _samples
                .AsSpan(
                    _position,
                    count)
                .CopyTo(
                    buffer);

            _position +=
                count;

            return count;
        }
    }
}
