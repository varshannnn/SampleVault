using NAudio.Wave;

namespace SampleVault.Api.Services;

public class WaveformService
{
    public float[] GeneratePeaks(
        string filePath,
        int pointCount = 300)
    {
        using var reader =
            new AudioFileReader(filePath);

        ISampleProvider sampleProvider = reader;

        int channels =
            reader.WaveFormat.Channels;

        int sampleRate =
            reader.WaveFormat.SampleRate;

        long totalFrames =
            (long)Math.Ceiling(
                reader.TotalTime.TotalSeconds *
                sampleRate);

        long framesPerPoint = Math.Max(
            1,
            (long)Math.Ceiling(
                totalFrames /
                (double)pointCount));

        var peaks =
            new List<float>(pointCount);

        float[] buffer =
            new float[4096 * channels];

        long framesInCurrentPoint = 0;

        float currentPeak = 0;

        int samplesRead;

        while (
            (samplesRead =
                sampleProvider.Read(
                    buffer.AsSpan())) > 0)
        {
            for (
                int i = 0;
                i < samplesRead;
                i += channels)
            {
                float framePeak = 0;

                for (
                    int channel = 0;
                    channel < channels &&
                    i + channel < samplesRead;
                    channel++)
                {
                    float value = Math.Abs(
                        buffer[i + channel]);

                    framePeak = Math.Max(
                        framePeak,
                        value);
                }

                currentPeak = Math.Max(
                    currentPeak,
                    framePeak);

                framesInCurrentPoint++;

                if (
                    framesInCurrentPoint >=
                    framesPerPoint)
                {
                    peaks.Add(
                        Math.Min(
                            currentPeak,
                            1f));

                    currentPeak = 0;
                    framesInCurrentPoint = 0;
                }
            }
        }

        if (framesInCurrentPoint > 0)
        {
            peaks.Add(
                Math.Min(
                    currentPeak,
                    1f));
        }

        return peaks
            .Take(pointCount)
            .ToArray();
    }
}