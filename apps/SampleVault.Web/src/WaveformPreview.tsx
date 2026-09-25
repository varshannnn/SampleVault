import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

type WaveformPreviewProps = {
  sampleId: number;
  isActive: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
};

const waveformCache =
  new Map<number, number[]>();

function WaveformPreview({
  sampleId,
  isActive,
  audioRef,
}: WaveformPreviewProps) {
  const containerRef =
    useRef<HTMLDivElement | null>(null);

  const [shouldLoad, setShouldLoad] =
    useState(false);

  const [peaks, setPeaks] =
    useState<number[] | null>(
      waveformCache.get(sampleId) ?? null
    );

  const [progress, setProgress] =
    useState(0);

  /*
    Lazy-load waveform data only when the
    card gets close to the viewport.
  */
  useEffect(() => {
    if (
      peaks ||
      shouldLoad ||
      !containerRef.current
    ) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          const entry = entries[0];

          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        },
        {
          rootMargin: "250px",
        }
      );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [peaks, shouldLoad]);

  /*
    Fetch waveform peaks.
  */
  useEffect(() => {
    if (!shouldLoad || peaks) {
      return;
    }

    const controller =
      new AbortController();

    fetch(
      `http://localhost:5085/api/samples/${sampleId}/waveform?points=64`,
      {
        signal: controller.signal,
      }
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Waveform request failed."
          );
        }

        return response.json();
      })
      .then((data) => {
        const newPeaks: number[] =
          data.peaks;

        waveformCache.set(
          sampleId,
          newPeaks
        );

        setPeaks(newPeaks);
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error(
          `Failed to load waveform for sample ${sampleId}:`,
          error
        );
      });

    return () => {
      controller.abort();
    };
  }, [sampleId, shouldLoad, peaks]);

  /*
    Track playback progress ONLY if this
    waveform belongs to the active sample.
  */
  useEffect(() => {
    if (!isActive) {
      setProgress(0);
      return;
    }

    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const updateProgress = () => {
      if (
        !Number.isFinite(audio.duration) ||
        audio.duration <= 0
      ) {
        setProgress(0);
        return;
      }

      setProgress(
        Math.min(
          1,
          audio.currentTime / audio.duration
        )
      );
    };

    const resetProgress = () => {
      setProgress(0);
    };

    audio.addEventListener(
      "timeupdate",
      updateProgress
    );

    audio.addEventListener(
      "ended",
      resetProgress
    );

    audio.addEventListener(
      "loadedmetadata",
      updateProgress
    );

    updateProgress();

    return () => {
      audio.removeEventListener(
        "timeupdate",
        updateProgress
      );

      audio.removeEventListener(
        "ended",
        resetProgress
      );

      audio.removeEventListener(
        "loadedmetadata",
        updateProgress
      );
    };
  }, [isActive, audioRef]);

  return (
    <div
      ref={containerRef}
      className="waveform-preview"
    >
      {peaks && peaks.length > 0 && (
        <svg
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {peaks.map((peak, index) => {
            const x =
              peaks.length === 1
                ? 50
                : (index /
                    (peaks.length - 1)) *
                  100;

            const amplitude =
              Math.max(
                0,
                Math.min(1, peak)
              );

            const halfHeight =
              amplitude * 14;

            const hasPlayed =
              isActive &&
              x <= progress * 100;

            return (
              <line
                key={index}
                className={
                  hasPlayed
                    ? "waveform-line waveform-played"
                    : "waveform-line"
                }
                x1={x}
                x2={x}
                y1={16 - halfHeight}
                y2={16 + halfHeight}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

export default WaveformPreview;