import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  PointerEvent as ReactPointerEvent,
} from "react";

import "./App.css";
import type { DrumRackSound } from "./DrumRackSound";
import type { MelodicSamplerSound } from "./MelodicSampler";

type LabSample = {
  id: number;
  fileName: string;
  durationSeconds: number;
  tags: string[];
};


export type LabSessionState = {
  sampleId: number;

  startTime: number;
  endTime: number;
  reverse: boolean;

  loopEnabled: boolean;
  loopStartTime: number;
  loopEndTime: number;

  autoSmoothLoop: boolean;
  loopCrossfadeMs: number;
};

type LabViewProps = {
  sample: LabSample;

  onBack: () => void;

  onRendered: () => Promise<void>;

  onAddToDrumRack: (
    sound: DrumRackSound
  ) => void;

  editingRackSlotIndex:
    | number
    | null;

  onUpdateRackSound: (
    slotIndex: number,
    sound: DrumRackSound
  ) => void;

  onOpenInMelodicSampler: (
    sound: MelodicSamplerSound
  ) => void;

  onOpenDrumRack: () => void;

  initialSession:
    | LabSessionState
    | null;

  onSessionChange: (
    session: LabSessionState
  ) => void;
};

function LabView({
  sample,
  onBack,
  onRendered,
  onAddToDrumRack,
  editingRackSlotIndex,
  onUpdateRackSound,
  onOpenInMelodicSampler,
  onOpenDrumRack,
  initialSession,
  onSessionChange,
}: LabViewProps) {
  const [peaks, setPeaks] =
    useState<number[]>([]);

  const savedSession =
    initialSession?.sampleId ===
    sample.id
      ? initialSession
      : null;

  const [startTime, setStartTime] =
    useState(
      savedSession?.startTime ??
        0
    );

  const [endTime, setEndTime] =
    useState(
      savedSession?.endTime ??
        sample.durationSeconds
    );

  const [reverse, setReverse] =
    useState(
      savedSession?.reverse ??
        false
    );

  /*
    Optional loop region inside the current Lab
    selection. These are stored in SOURCE time.

    Because the source times stay stable, turning
    Reverse on/off simply mirrors the loop region
    with the waveform instead of losing the points.
  */
  const [
    loopEnabled,
    setLoopEnabled,
  ] = useState(
    savedSession?.loopEnabled ??
      false
  );

  const [
    loopStartTime,
    setLoopStartTime,
  ] = useState(
    savedSession?.loopStartTime ??
      0
  );

  const [
    loopEndTime,
    setLoopEndTime,
  ] = useState(
    savedSession?.loopEndTime ??
      sample.durationSeconds
  );

  /*
    Two layers of loop de-clicking:

    1. Auto Smooth nudges the loop boundaries to
       nearby quiet / zero-ish points.

    2. Crossfade blends the final few milliseconds
       of the loop into its beginning. This is the
       stronger fix for sustained tones where a
       zero crossing alone can still have a slope
       mismatch and click.
  */
  const [
    autoSmoothLoop,
    setAutoSmoothLoop,
  ] = useState(
    savedSession?.autoSmoothLoop ??
      true
  );

  const [
    loopCrossfadeMs,
    setLoopCrossfadeMs,
  ] = useState(
    savedSession?.loopCrossfadeMs ??
      8
  );

  const [isRendering, setIsRendering] =
    useState(false);

  const [renderedPath, setRenderedPath] =
    useState<string | null>(null);

  const [
    renderedSampleId,
    setRenderedSampleId,
  ] = useState<number | null>(null);

  const [renderError, setRenderError] =
    useState<string | null>(null);

  const [isPreviewing, setIsPreviewing] =
    useState(false);

  const [
    isAddingToRack,
    setIsAddingToRack,
  ] = useState(false);

  const [
    isUpdatingRack,
    setIsUpdatingRack,
  ] = useState(false);

  const [
    rackMessage,
    setRackMessage,
  ] = useState<string | null>(
    null
  );

  const [
    isOpeningMelodic,
    setIsOpeningMelodic,
  ] = useState(false);

  /*
    Normal forward playback.
  */
  const audioRef =
    useRef<HTMLAudioElement | null>(null);

  /*
    Web Audio objects used for reverse preview.
  */
  const audioContextRef =
    useRef<AudioContext | null>(null);

  const decodedBufferRef =
    useRef<AudioBuffer | null>(null);

  const reverseSourceRef =
    useRef<AudioBufferSourceNode | null>(
      null
    );

  /*
    Waveform trimming is selection-based.

    The handles are VISUAL left/right handles.
    That matters when Reverse is enabled because
    the displayed waveform itself is reversed:

      visual left  -> source end
      visual right -> source start
  */
  const trimDragRef =
    useRef<{
      mode:
        | "new"
        | "left"
        | "right"
        | "loop-left"
        | "loop-right";

      anchorVisualTime: number;
    } | null>(
      null
    );

  /*
    Reset the Lab when a different sample
    is opened.
  */
  useEffect(() => {
    const restored =
      initialSession?.sampleId ===
      sample.id
        ? initialSession
        : null;

    setStartTime(
      restored?.startTime ??
        0
    );

    setEndTime(
      restored?.endTime ??
        sample.durationSeconds
    );

    setReverse(
      restored?.reverse ??
        false
    );

    setLoopEnabled(
      restored?.loopEnabled ??
        false
    );

    setLoopStartTime(
      restored?.loopStartTime ??
        0
    );

    setLoopEndTime(
      restored?.loopEndTime ??
        sample.durationSeconds
    );

    setAutoSmoothLoop(
      restored?.autoSmoothLoop ??
        true
    );

    setLoopCrossfadeMs(
      restored?.loopCrossfadeMs ??
        8
    );

    setRenderedPath(null);
    setRenderedSampleId(null);
    setRenderError(null);
    setRackMessage(null);

    decodedBufferRef.current = null;

    setIsPreviewing(false);
  }, [
    sample.id,
    sample.durationSeconds,
  ]);

  /*
    App.tsx owns a lightweight snapshot of the Lab
    controls. That means Lab -> Drum Rack / Melodic
    Sampler -> Lab returns to the same edit instead
    of resetting trim/reverse/loop points.
  */
  useEffect(() => {
    onSessionChange({
      sampleId:
        sample.id,

      startTime,
      endTime,
      reverse,

      loopEnabled,
      loopStartTime,
      loopEndTime,

      autoSmoothLoop,
      loopCrossfadeMs,
    });
  }, [
    sample.id,
    startTime,
    endTime,
    reverse,
    loopEnabled,
    loopStartTime,
    loopEndTime,
    autoSmoothLoop,
    loopCrossfadeMs,
  ]);

  /*
    Load the high-resolution Lab waveform.
  */
  useEffect(() => {
    const controller =
      new AbortController();

    setPeaks([]);

    fetch(
      `http://localhost:5085/api/samples/${sample.id}/waveform?points=500`,
      {
        signal: controller.signal,
      }
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Failed to load waveform."
          );
        }

        return response.json();
      })
      .then((data) => {
        setPeaks(data.peaks);
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Failed to load Lab waveform:",
          error
        );
      });

    return () => {
      controller.abort();
    };
  }, [sample.id]);

  /*
    Stop either kind of preview.
  */
  const stopPreview = () => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
    }

    if (reverseSourceRef.current) {
      try {
        reverseSourceRef.current.stop();
      } catch {
        // Source may already have stopped.
      }

      reverseSourceRef.current = null;
    }

    setIsPreviewing(false);
  };

  /*
    Get or create our AudioContext.
  */
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current =
        new AudioContext({
          latencyHint:
            "interactive",
        });
    }

    return audioContextRef.current;
  };

  /*
    Download and decode the original WAV
    once per Lab session.

    After the first reverse preview, later
    reverse previews reuse this decoded data.
  */
  const getDecodedAudio =
    async (): Promise<AudioBuffer> => {
      if (decodedBufferRef.current) {
        return decodedBufferRef.current;
      }

      const response = await fetch(
        `http://localhost:5085/api/samples/${sample.id}/rack-audio`
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load audio for preview."
        );
      }

      const arrayBuffer =
        await response.arrayBuffer();

      const context =
        getAudioContext();

      const decoded =
        await context.decodeAudioData(
          arrayBuffer
        );

      decodedBufferRef.current =
        decoded;

      return decoded;
    };

  /*
    Loop clicks happen when the waveform value at
    Loop End is very different from the waveform
    value at Loop Start.

    Snap each loop boundary to the quietest nearby
    sample frame (roughly a zero crossing). We keep
    the user's marker visually where they placed it,
    but playback uses this tiny de-click adjustment.

    ±15 ms is wide enough to find a zero crossing
    even on low 808 notes, while still preserving
    the intended loop position.
  */
  const snapLoopTimeToQuietFrame = (
    buffer: AudioBuffer,
    requestedTime: number,
    searchWindowMs = 15
  ) => {
    const sampleRate =
      buffer.sampleRate;

    const requestedFrame =
      Math.max(
        0,
        Math.min(
          buffer.length - 1,
          Math.round(
            requestedTime *
              sampleRate
          )
        )
      );

    const radiusFrames =
      Math.max(
        1,
        Math.round(
          (
            searchWindowMs /
            1000
          ) *
            sampleRate
        )
      );

    const firstFrame =
      Math.max(
        0,
        requestedFrame -
          radiusFrames
      );

    const lastFrame =
      Math.min(
        buffer.length - 1,
        requestedFrame +
          radiusFrames
      );

    let bestFrame =
      requestedFrame;

    let bestScore =
      Number.POSITIVE_INFINITY;

    for (
      let frame = firstFrame;
      frame <= lastFrame;
      frame++
    ) {
      let score = 0;

      for (
        let channel = 0;
        channel <
        buffer.numberOfChannels;
        channel++
      ) {
        const value =
          buffer.getChannelData(
            channel
          )[frame];

        /*
          The maximum channel magnitude is a better
          stereo seam metric than checking only L.
        */
        score =
          Math.max(
            score,
            Math.abs(value)
          );
      }

      /*
        Slightly prefer points closer to the user's
        marker when two candidates are equally quiet.
      */
      score +=
        (
          Math.abs(
            frame -
              requestedFrame
          ) /
          Math.max(
            1,
            radiusFrames
          )
        ) *
        0.00005;

      if (
        score <
        bestScore
      ) {
        bestScore =
          score;

        bestFrame =
          frame;
      }
    }

    return (
      bestFrame /
      sampleRate
    );
  };

  const getSmoothLoopBounds = (
    buffer: AudioBuffer,
    requestedStart: number,
    requestedEnd: number
  ) => {
    const minimumLoop =
      Math.max(
        0.005,
        2 /
          buffer.sampleRate
      );

    let smoothStart =
      requestedStart;

    let smoothEnd =
      requestedEnd;

    if (autoSmoothLoop) {
      smoothStart =
        snapLoopTimeToQuietFrame(
          buffer,
          requestedStart
        );

      smoothEnd =
        snapLoopTimeToQuietFrame(
          buffer,
          requestedEnd
        );
    }

    if (
      smoothEnd -
        smoothStart <
      minimumLoop
    ) {
      smoothStart =
        requestedStart;

      smoothEnd =
        requestedEnd;
    }

    return {
      start:
        Math.max(
          0,
          Math.min(
            buffer.duration -
              minimumLoop,
            smoothStart
          )
        ),

      end:
        Math.max(
          smoothStart +
            minimumLoop,
          Math.min(
            buffer.duration,
            smoothEnd
          )
        ),
    };
  };

  type PreparedLoop = {
    buffer: AudioBuffer;
    loopStart: number;
    loopEnd: number;
    appliedCrossfadeMs: number;
  };

  /*
    Build a playback-only copy with a real overlap
    crossfade at the loop seam.

    Suppose the requested loop is:

      [ head ......................... tail ]

    We blend the final N samples of "tail" toward
    the first N samples of "head", then move the
    native loopStart forward by N samples.

    At the seam the final blended sample is almost
    exactly the sample immediately BEFORE the new
    loopStart, so the waveform continues instead
    of jumping.

    This is substantially stronger than merely
    finding two independent zero crossings.
  */
  const prepareCrossfadedLoop = (
    sourceBuffer: AudioBuffer,
    requestedStart: number,
    requestedEnd: number
  ): PreparedLoop => {
    const context =
      getAudioContext();

    const smooth =
      getSmoothLoopBounds(
        sourceBuffer,
        requestedStart,
        requestedEnd
      );

    const sampleRate =
      sourceBuffer.sampleRate;

    const startFrame =
      Math.max(
        0,
        Math.min(
          sourceBuffer.length - 2,
          Math.round(
            smooth.start *
              sampleRate
          )
        )
      );

    const endFrame =
      Math.max(
        startFrame + 2,
        Math.min(
          sourceBuffer.length,
          Math.round(
            smooth.end *
              sampleRate
          )
        )
      );

    const loopFrames =
      endFrame -
      startFrame;

    /*
      Never let the overlap consume too much of a
      very short loop. 25% is a safe upper bound.
    */
    const requestedFrames =
      Math.max(
        0,
        Math.round(
          (
            Math.max(
              0,
              loopCrossfadeMs
            ) /
            1000
          ) *
            sampleRate
        )
      );

    const maxCrossfadeFrames =
      Math.max(
        0,
        Math.floor(
          loopFrames *
            0.25
        )
      );

    const crossfadeFrames =
      Math.min(
        requestedFrames,
        maxCrossfadeFrames
      );

    if (
      crossfadeFrames < 2
    ) {
      return {
        buffer:
          sourceBuffer,

        loopStart:
          startFrame /
          sampleRate,

        loopEnd:
          endFrame /
          sampleRate,

        appliedCrossfadeMs:
          0,
      };
    }

    const prepared =
      context.createBuffer(
        sourceBuffer.numberOfChannels,
        sourceBuffer.length,
        sourceBuffer.sampleRate
      );

    for (
      let channel = 0;
      channel <
      sourceBuffer.numberOfChannels;
      channel++
    ) {
      const sourceData =
        sourceBuffer.getChannelData(
          channel
        );

      const targetData =
        prepared.getChannelData(
          channel
        );

      targetData.set(
        sourceData
      );

      /*
        Equal-power crossfade:

        tail gain falls cos(theta)
        head gain rises sin(theta)

        The very end of the loop becomes the sample
        just before our adjusted loopStart, making
        the native wrap continuous.
      */
      for (
        let i = 0;
        i <
        crossfadeFrames;
        i++
      ) {
        const denominator =
          Math.max(
            1,
            crossfadeFrames -
              1
          );

        const t =
          i /
          denominator;

        const theta =
          t *
          Math.PI /
          2;

        const tailGain =
          Math.cos(theta);

        const headGain =
          Math.sin(theta);

        const tailIndex =
          endFrame -
          crossfadeFrames +
          i;

        const headIndex =
          startFrame +
          i;

        targetData[
          tailIndex
        ] =
          sourceData[
            tailIndex
          ] *
            tailGain +
          sourceData[
            headIndex
          ] *
            headGain;
      }
    }

    const adjustedStartFrame =
      startFrame +
      crossfadeFrames;

    return {
      buffer:
        prepared,

      loopStart:
        adjustedStartFrame /
        sampleRate,

      loopEnd:
        endFrame /
        sampleRate,

      appliedCrossfadeMs:
        (
          crossfadeFrames /
          sampleRate
        ) *
        1000,
    };
  };

  /*
    Play the selected region FORWARD.

    Normal non-loop preview still uses the HTML
    audio element. Loop preview uses Web Audio so
    the browser can loop sample-accurately instead
    of repeatedly seeking currentTime.
  */
  const playForwardSelection = async () => {
    if (loopEnabled) {
      const context =
        getAudioContext();

      if (
        context.state ===
        "suspended"
      ) {
        await context.resume();
      }

      const original =
        await getDecodedAudio();

      const source =
        context.createBufferSource();

      const preparedLoop =
        prepareCrossfadedLoop(
          original,
          loopStartTime,
          loopEndTime
        );

      source.buffer =
        preparedLoop.buffer;

      source.loop =
        true;

      source.loopStart =
        preparedLoop.loopStart;

      source.loopEnd =
        preparedLoop.loopEnd;

      source.connect(
        context.destination
      );

      reverseSourceRef.current =
        source;

      source.onended = () => {
        if (
          reverseSourceRef.current ===
          source
        ) {
          reverseSourceRef.current =
            null;

          setIsPreviewing(false);
        }
      };

      setIsPreviewing(true);

      /*
        Start at Trim In. Web Audio plays the
        attack/pre-loop material once, then repeats
        the snapped loop bounds sample-accurately.
      */
      source.start(
        0,
        startTime
      );

      return;
    }

    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    audio.currentTime =
      startTime;

    setIsPreviewing(true);

    await audio.play();
  };

  /*
    Create a temporary reversed AudioBuffer
    containing ONLY the selected trim region.

    Important:
    each channel is reversed by frame, so
    stereo stays stereo.
  */
  const playReverseSelection = async () => {
    const context =
      getAudioContext();

    if (context.state === "suspended") {
      await context.resume();
    }

    const original =
      await getDecodedAudio();

    const sampleRate =
      original.sampleRate;

    const startFrame =
      Math.max(
        0,
        Math.floor(
          startTime * sampleRate
        )
      );

    const endFrame =
      Math.min(
        original.length,
        Math.ceil(
          endTime * sampleRate
        )
      );

    const frameCount =
      endFrame - startFrame;

    if (frameCount <= 0) {
      return;
    }

    /*
      Make a new temporary AudioBuffer
      exactly the length of our selection.
    */
    const reversedBuffer =
      context.createBuffer(
        original.numberOfChannels,
        frameCount,
        sampleRate
      );

    /*
      Reverse each channel.

      Stereo example:

      Original:
      [L1 R1] [L2 R2] [L3 R3]

      Reversed:
      [L3 R3] [L2 R2] [L1 R1]
    */
    for (
      let channel = 0;
      channel <
      original.numberOfChannels;
      channel++
    ) {
      const sourceData =
        original.getChannelData(
          channel
        );

      const destinationData =
        reversedBuffer.getChannelData(
          channel
        );

      for (
        let i = 0;
        i < frameCount;
        i++
      ) {
        destinationData[i] =
          sourceData[
            endFrame - 1 - i
          ];
      }
    }

    const source =
      context.createBufferSource();

    source.buffer =
      reversedBuffer;

    /*
      The temporary reversed buffer starts at
      output time 0, so convert the SOURCE loop
      points into positions inside the rendered
      reversed selection.
    */
    if (loopEnabled) {
      const outputLoopStart =
        Math.max(
          0,
          endTime -
            loopEndTime
        );

      const outputLoopEnd =
        Math.min(
          reversedBuffer.duration,
          endTime -
            loopStartTime
        );

      if (
        outputLoopEnd -
          outputLoopStart >
        0.001
      ) {
        const preparedLoop =
          prepareCrossfadedLoop(
            reversedBuffer,
            outputLoopStart,
            outputLoopEnd
          );

        source.buffer =
          preparedLoop.buffer;

        source.loop =
          true;

        source.loopStart =
          preparedLoop.loopStart;

        source.loopEnd =
          preparedLoop.loopEnd;
      }
    }

    source.connect(
      context.destination
    );

    reverseSourceRef.current =
      source;

    source.onended = () => {
      if (
        reverseSourceRef.current ===
        source
      ) {
        reverseSourceRef.current =
          null;

        setIsPreviewing(false);
      }
    };

    setIsPreviewing(true);

    source.start();
  };

  /*
    Preview button.

    Reverse OFF:
      use normal audio playback

    Reverse ON:
      use our temporary reversed buffer
  */
  const handlePlaySelection =
    async () => {
      stopPreview();
      setRenderError(null);

      try {
        if (reverse) {
          await playReverseSelection();
        } else {
          await playForwardSelection();
        }
      } catch (error) {
        console.error(
          "Preview failed:",
          error
        );

        setRenderError(
          error instanceof Error
            ? `Preview failed: ${error.message}`
            : "Preview failed."
        );

        setIsPreviewing(false);
      }
    };

  /*
    Stop normal forward playback once it
    reaches the trim end.
  */
  useEffect(() => {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      if (audio.paused) {
        return;
      }

      if (
        !loopEnabled &&
        audio.currentTime >=
          endTime
      ) {
        audio.pause();

        audio.currentTime =
          startTime;

        setIsPreviewing(false);
      }
    };

    const handleEnded = () => {
      setIsPreviewing(false);
    };

    audio.addEventListener(
      "timeupdate",
      handleTimeUpdate
    );

    audio.addEventListener(
      "ended",
      handleEnded
    );

    return () => {
      audio.removeEventListener(
        "timeupdate",
        handleTimeUpdate
      );

      audio.removeEventListener(
        "ended",
        handleEnded
      );
    };
  }, [
    startTime,
    endTime,
    loopEnabled,
    loopStartTime,
    loopEndTime,
  ]);

  /*
    Stop audio and close the Web Audio
    context when leaving the Lab.
  */
  useEffect(() => {
    return () => {
      if (reverseSourceRef.current) {
        try {
          reverseSourceRef.current.stop();
        } catch {
          // Already stopped.
        }
      }

      if (audioContextRef.current) {
        audioContextRef.current
          .close()
          .catch(() => {});
      }
    };
  }, []);

  /*
    Render a permanent new WAV using
    the backend.
  */
  const handleRender =
    async () => {
      if (endTime <= startTime) {
        setRenderError(
          "Trim end must be after trim start."
        );

        return;
      }

      setIsRendering(true);
      setRenderError(null);
      setRenderedPath(null);
      setRenderedSampleId(null);

      try {
        const response =
          await fetch(
            `http://localhost:5085/api/samples/${sample.id}/render`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                startTime,
                endTime,
                reverse,
              }),
            }
          );

        if (!response.ok) {
          const message =
            await response.text();

          throw new Error(
            message ||
              "Failed to render sample."
          );
        }

        const result =
          await response.json();

        setRenderedPath(
          result.outputPath
        );

        setRenderedSampleId(
          result.sample.id
        );

        /*
          Refresh the parent Library state
          immediately so no browser refresh
          is needed.
        */
        await onRendered();
      } catch (error) {
        if (error instanceof Error) {
          setRenderError(
            error.message
          );
        } else {
          setRenderError(
            "Something went wrong while rendering."
          );
        }
      } finally {
        setIsRendering(false);
      }
    };

  /*
    Both "Add to Drum Rack" and "Open in Melodic
    Sampler" need the exact current Lab edit.

    The backend creates a temporary WAV but does
    NOT add it to the Library/database.
  */
  const createTemporaryLabEdit =
    async () => {
      if (endTime <= startTime) {
        throw new Error(
          "Trim end must be after trim start."
        );
      }

      const response =
        await fetch(
          `http://localhost:5085/api/samples/${sample.id}/render-temp`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              startTime,
              endTime,
              reverse,
            }),
          }
        );

      if (!response.ok) {
        const message =
          await response.text();

        throw new Error(
          message ||
            "Failed to prepare temporary Lab edit."
        );
      }

      return await response.json();
    };

  /*
    Render the current Lab state and describe it as
    a DrumRackSound. Both Rack actions use this same
    helper, so "Update" and "Add as New" produce the
    exact same audio.
  */
  const createRackSoundFromCurrentEdit =
    async (): Promise<DrumRackSound> => {
      const result =
        await createTemporaryLabEdit();

      return {
        rackId:
          `temp-${result.tempId}`,

        sourceKind:
          "temporary",

        sampleId:
          null,

        tempId:
          result.tempId,

        rackAssetSlotId:
          null,

        fileName:
          result.fileName,

        durationSeconds:
          result.durationSeconds,

        tags:
          result.tags,

        audioUrl:
          result.audioUrl,

        labSourceSampleId:
          sample.id,

        labState: {
          startTime,
          endTime,
          reverse,

          loopEnabled,
          loopStartTime,
          loopEndTime,

          autoSmoothLoop,
          loopCrossfadeMs,
        },
      };
    };

  /*
    Keep the pad we came from untouched and add the
    current edit as another Rack sound.
  */
  const handleAddCurrentEditToRack =
    async () => {
      if (endTime <= startTime) {
        setRenderError(
          "Trim end must be after trim start."
        );

        return;
      }

      setIsAddingToRack(true);
      setRenderError(null);
      setRackMessage(null);

      try {
        const rackSound =
          await createRackSoundFromCurrentEdit();

        onAddToDrumRack(
          rackSound
        );

        setRackMessage(
          "✓ Added current edit as a new Drum Rack sound"
        );
      } catch (error) {
        if (
          error instanceof Error
        ) {
          setRenderError(
            error.message
          );
        } else {
          setRenderError(
            "Something went wrong while preparing the rack sound."
          );
        }
      } finally {
        setIsAddingToRack(
          false
        );
      }
    };

  /*
    Replace the exact Rack pad that opened this Lab.
    The old temporary audio is cleaned up by App.tsx
    only after the new render has succeeded.
  */
  const handleUpdateRackSound =
    async () => {
      if (
        editingRackSlotIndex ===
        null
      ) {
        return;
      }

      if (endTime <= startTime) {
        setRenderError(
          "Trim end must be after trim start."
        );

        return;
      }

      setIsUpdatingRack(true);
      setRenderError(null);
      setRackMessage(null);

      try {
        const rackSound =
          await createRackSoundFromCurrentEdit();

        onUpdateRackSound(
          editingRackSlotIndex,
          rackSound
        );

        setRackMessage(
          `✓ Updated Drum Rack pad ${editingRackSlotIndex + 1}`
        );
      } catch (error) {
        if (
          error instanceof Error
        ) {
          setRenderError(
            error.message
          );
        } else {
          setRenderError(
            "Something went wrong while updating the rack sound."
          );
        }
      } finally {
        setIsUpdatingRack(
          false
        );
      }
    };

  const handleOpenCurrentEditInMelodic =
    async () => {
      setIsOpeningMelodic(
        true
      );

      setRenderError(
        null
      );

      stopPreview();

      try {
        const result =
          await createTemporaryLabEdit();

        const melodicSound:
          MelodicSamplerSound = {
          sourceId:
            `temp-${result.tempId}`,

          sourceKind:
            "temporary",

          tempId:
            result.tempId,

          fileName:
            result.fileName,

          durationSeconds:
            result.durationSeconds,

          tags:
            result.tags,

          audioUrl:
            result.audioUrl,

          /*
            The temporary render is exactly the
            trimmed/reversed selection, so send
            loop points relative to THAT new clip.
          */
          loopStartSeconds:
            loopEnabled
              ? (
                  reverse
                    ? endTime -
                      loopEndTime
                    : loopStartTime -
                      startTime
                )
              : undefined,

          loopEndSeconds:
            loopEnabled
              ? (
                  reverse
                    ? endTime -
                      loopStartTime
                    : loopEndTime -
                      startTime
                )
              : undefined,

          loopCrossfadeMs:
            loopEnabled
              ? loopCrossfadeMs
              : undefined,

          loopAutoSmooth:
            loopEnabled
              ? autoSmoothLoop
              : undefined,
        };

        onOpenInMelodicSampler(
          melodicSound
        );
      } catch (error) {
        if (
          error instanceof Error
        ) {
          setRenderError(
            error.message
          );
        } else {
          setRenderError(
            "Something went wrong while preparing the Melodic Sampler sound."
          );
        }
      } finally {
        setIsOpeningMelodic(
          false
        );
      }
    };

  const duration =
    Math.max(
      sample.durationSeconds,
      0.001
    );

  const MIN_SELECTION_SECONDS =
    0.001;

  /*
    Reverse changes the waveform we DISPLAY.

    The backend still stores trim boundaries in
    source-file coordinates (startTime/endTime),
    because it trims first and reverses second.

    So we translate between:
      source time  <->  displayed waveform time
  */
  const sourceToVisualTime = (
    sourceTime: number
  ) => {
    return reverse
      ? duration - sourceTime
      : sourceTime;
  };

  const visualToSourceTime = (
    visualTime: number
  ) => {
    return reverse
      ? duration - visualTime
      : visualTime;
  };

  /*
    The selected source region [startTime, endTime]
    appears mirrored on the reversed waveform.
  */
  const visualStartTime =
    reverse
      ? sourceToVisualTime(
          endTime
        )
      : startTime;

  const visualEndTime =
    reverse
      ? sourceToVisualTime(
          startTime
        )
      : endTime;

  const visualStartPercent =
    Math.max(
      0,
      Math.min(
        100,
        (
          visualStartTime /
          duration
        ) * 100
      )
    );

  const visualEndPercent =
    Math.max(
      visualStartPercent,
      Math.min(
        100,
        (
          visualEndTime /
          duration
        ) * 100
      )
    );

  const selectionWidthPercent =
    Math.max(
      0,
      visualEndPercent -
        visualStartPercent
    );

  const MIN_LOOP_SECONDS =
    0.005;

  /*
    Keep loop points valid whenever Trim changes.

    If the old loop region is completely outside
    the new selection, reset it to the full trim.
    Otherwise preserve as much of it as possible.
  */
  useEffect(() => {
    const clampedStart =
      Math.max(
        startTime,
        Math.min(
          loopStartTime,
          endTime -
            MIN_LOOP_SECONDS
        )
      );

    const clampedEnd =
      Math.min(
        endTime,
        Math.max(
          loopEndTime,
          startTime +
            MIN_LOOP_SECONDS
        )
      );

    if (
      clampedEnd -
        clampedStart <
      MIN_LOOP_SECONDS
    ) {
      setLoopStartTime(
        startTime
      );

      setLoopEndTime(
        endTime
      );

      return;
    }

    if (
      clampedStart !==
      loopStartTime
    ) {
      setLoopStartTime(
        clampedStart
      );
    }

    if (
      clampedEnd !==
      loopEndTime
    ) {
      setLoopEndTime(
        clampedEnd
      );
    }
  }, [
    startTime,
    endTime,
    loopStartTime,
    loopEndTime,
  ]);

  /*
    Visual loop points mirror with Reverse in the
    same way the trim selection does.
  */
  const visualLoopStartTime =
    reverse
      ? sourceToVisualTime(
          loopEndTime
        )
      : loopStartTime;

  const visualLoopEndTime =
    reverse
      ? sourceToVisualTime(
          loopStartTime
        )
      : loopEndTime;

  const visualLoopStartPercent =
    Math.max(
      visualStartPercent,
      Math.min(
        visualEndPercent,
        (
          visualLoopStartTime /
          duration
        ) *
          100
      )
    );

  const visualLoopEndPercent =
    Math.max(
      visualLoopStartPercent,
      Math.min(
        visualEndPercent,
        (
          visualLoopEndTime /
          duration
        ) *
          100
      )
    );

  const loopWidthPercent =
    Math.max(
      0,
      visualLoopEndPercent -
        visualLoopStartPercent
    );

  /*
    Loop values presented to the user are relative
    to the EDITED clip timeline (0 = Trim In),
    which stays intuitive in both forward and
    reversed views.
  */
  const outputLoopStart =
    reverse
      ? endTime -
        loopEndTime
      : loopStartTime -
        startTime;

  const outputLoopEnd =
    reverse
      ? endTime -
        loopStartTime
      : loopEndTime -
        startTime;

  const setLoopFromVisualRange = (
    visualA: number,
    visualB: number
  ) => {
    let visualLow =
      Math.max(
        visualStartTime,
        Math.min(
          visualEndTime,
          Math.min(
            visualA,
            visualB
          )
        )
      );

    let visualHigh =
      Math.max(
        visualStartTime,
        Math.min(
          visualEndTime,
          Math.max(
            visualA,
            visualB
          )
        )
      );

    if (
      visualHigh -
        visualLow <
      MIN_LOOP_SECONDS
    ) {
      visualHigh =
        Math.min(
          visualEndTime,
          visualLow +
            MIN_LOOP_SECONDS
        );

      if (
        visualHigh -
          visualLow <
        MIN_LOOP_SECONDS
      ) {
        visualLow =
          Math.max(
            visualStartTime,
            visualHigh -
              MIN_LOOP_SECONDS
          );
      }
    }

    const sourceA =
      visualToSourceTime(
        visualLow
      );

    const sourceB =
      visualToSourceTime(
        visualHigh
      );

    setLoopStartTime(
      Math.min(
        sourceA,
        sourceB
      )
    );

    setLoopEndTime(
      Math.max(
        sourceA,
        sourceB
      )
    );
  };

  /*
    This is the waveform the user is actually
    looking at. Reverse ON means the WHOLE source
    waveform flips, then the selection is drawn
    on top of that flipped waveform.
  */
  const displayPeaks =
    reverse
      ? [...peaks].reverse()
      : peaks;

  const pointerVisualTime = (
    clientX: number,
    element: HTMLDivElement
  ) => {
    const rect =
      element
        .getBoundingClientRect();

    const ratio =
      rect.width <= 0
        ? 0
        : (
            clientX -
            rect.left
          ) /
            rect.width;

    return Math.max(
      0,
      Math.min(
        duration,
        ratio * duration
      )
    );
  };

  const setSelectionFromVisualRange = (
    visualA: number,
    visualB: number
  ) => {
    let visualLow =
      Math.max(
        0,
        Math.min(
          duration,
          Math.min(
            visualA,
            visualB
          )
        )
      );

    let visualHigh =
      Math.max(
        0,
        Math.min(
          duration,
          Math.max(
            visualA,
            visualB
          )
        )
      );

    if (
      visualHigh -
        visualLow <
      MIN_SELECTION_SECONDS
    ) {
      visualHigh =
        Math.min(
          duration,
          visualLow +
            MIN_SELECTION_SECONDS
        );

      if (
        visualHigh -
          visualLow <
        MIN_SELECTION_SECONDS
      ) {
        visualLow =
          Math.max(
            0,
            visualHigh -
              MIN_SELECTION_SECONDS
          );
      }
    }

    const sourceA =
      visualToSourceTime(
        visualLow
      );

    const sourceB =
      visualToSourceTime(
        visualHigh
      );

    setStartTime(
      Math.min(
        sourceA,
        sourceB
      )
    );

    setEndTime(
      Math.max(
        sourceA,
        sourceB
      )
    );
  };

  const handleWaveformPointerDown = (
    event:
      ReactPointerEvent<
        HTMLDivElement
      >
  ) => {
    if (
      sample.durationSeconds <=
      0
    ) {
      return;
    }

    stopPreview();

    const target =
      event.target as
        HTMLElement;

    const loopHandle =
      target.closest<
        HTMLElement
      >(
        "[data-loop-handle]"
      );

    const handle =
      target.closest<
        HTMLElement
      >(
        "[data-trim-handle]"
      );

    const visualTime =
      pointerVisualTime(
        event.clientX,
        event.currentTarget
      );

    event.currentTarget
      .setPointerCapture(
        event.pointerId
      );

    if (
      loopEnabled &&
      loopHandle?.dataset
        .loopHandle ===
        "left"
    ) {
      trimDragRef.current = {
        mode:
          "loop-left",

        anchorVisualTime:
          visualTime,
      };

      return;
    }

    if (
      loopEnabled &&
      loopHandle?.dataset
        .loopHandle ===
        "right"
    ) {
      trimDragRef.current = {
        mode:
          "loop-right",

        anchorVisualTime:
          visualTime,
      };

      return;
    }

    if (
      handle?.dataset
        .trimHandle ===
      "left"
    ) {
      trimDragRef.current = {
        mode: "left",
        anchorVisualTime:
          visualTime,
      };

      return;
    }

    if (
      handle?.dataset
        .trimHandle ===
      "right"
    ) {
      trimDragRef.current = {
        mode: "right",
        anchorVisualTime:
          visualTime,
      };

      return;
    }

    /*
      Click/drag on empty waveform space creates
      a brand-new visual selection, regardless of
      whether the waveform is forward or reversed.
    */
    trimDragRef.current = {
      mode: "new",
      anchorVisualTime:
        visualTime,
    };

    setSelectionFromVisualRange(
      visualTime,
      Math.min(
        duration,
        visualTime +
          MIN_SELECTION_SECONDS
      )
    );
  };

  const handleWaveformPointerMove = (
    event:
      ReactPointerEvent<
        HTMLDivElement
      >
  ) => {
    const drag =
      trimDragRef.current;

    if (!drag) {
      return;
    }

    const visualTime =
      pointerVisualTime(
        event.clientX,
        event.currentTarget
      );

    if (
      drag.mode ===
      "new"
    ) {
      setSelectionFromVisualRange(
        drag.anchorVisualTime,
        visualTime
      );

      return;
    }

    if (
      drag.mode ===
        "loop-left"
    ) {
      const nextVisualStart =
        Math.max(
          visualStartTime,
          Math.min(
            visualTime,
            visualLoopEndTime -
              MIN_LOOP_SECONDS
          )
        );

      setLoopFromVisualRange(
        nextVisualStart,
        visualLoopEndTime
      );

      return;
    }

    if (
      drag.mode ===
        "loop-right"
    ) {
      const nextVisualEnd =
        Math.min(
          visualEndTime,
          Math.max(
            visualTime,
            visualLoopStartTime +
              MIN_LOOP_SECONDS
          )
        );

      setLoopFromVisualRange(
        visualLoopStartTime,
        nextVisualEnd
      );

      return;
    }

    if (
      drag.mode ===
      "left"
    ) {
      const nextVisualStart =
        Math.max(
          0,
          Math.min(
            visualTime,
            visualEndTime -
              MIN_SELECTION_SECONDS
          )
        );

      setSelectionFromVisualRange(
        nextVisualStart,
        visualEndTime
      );

      return;
    }

    const nextVisualEnd =
      Math.min(
        duration,
        Math.max(
          visualTime,
          visualStartTime +
            MIN_SELECTION_SECONDS
        )
      );

    setSelectionFromVisualRange(
      visualStartTime,
      nextVisualEnd
    );
  };

  const handleWaveformPointerUp = (
    event:
      ReactPointerEvent<
        HTMLDivElement
      >
  ) => {
    trimDragRef.current =
      null;

    if (
      event.currentTarget
        .hasPointerCapture(
          event.pointerId
        )
    ) {
      event.currentTarget
        .releasePointerCapture(
          event.pointerId
        );
    }
  };

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <button
          className="lab-back-button"
          onClick={() => {
            stopPreview();
            onBack();
          }}
        >
          ← Library
        </button>

        <div>
          <h1>Lab</h1>

          <strong>
            {sample.fileName}
          </strong>
        </div>

        <div className="workspace-nav">
          <button
            type="button"
            onClick={() => {
              stopPreview();
              onOpenDrumRack();
            }}
          >
            Drum Rack →
          </button>
        </div>
      </header>

      <section className="lab-editor">
        <div className="lab-waveform">
          {/*
            IMPORTANT:
            The interactive surface has exactly the
            same rectangle as the SVG.

            Previously .lab-waveform's padding was
            part of getBoundingClientRect(), while
            the SVG sat inside that padding. That
            made pointer percentages / trim markers
            slightly offset from the waveform.
          */}
          <div
            className="lab-waveform-surface lab-waveform-selectable"
            onPointerDown={
              handleWaveformPointerDown
            }
            onPointerMove={
              handleWaveformPointerMove
            }
            onPointerUp={
              handleWaveformPointerUp
            }
            onPointerCancel={
              handleWaveformPointerUp
            }
            title="Drag across the waveform to select audio. Drag either edge to fine-tune."
          >
          <svg
            viewBox="0 0 100 80"
            preserveAspectRatio="none"
            aria-label={`Waveform for ${sample.fileName}`}
          >
            {displayPeaks.map(
              (peak, index) => {
                const x =
                  displayPeaks.length <= 1
                    ? 50
                    : (
                        index /
                        (
                          displayPeaks.length -
                          1
                        )
                      ) *
                      100;

                const amplitude =
                  Math.max(
                    0,
                    Math.min(
                      1,
                      peak
                    )
                  );

                const halfHeight =
                  amplitude * 35;

                const selected =
                  x >=
                    visualStartPercent &&
                  x <=
                    visualEndPercent;

                return (
                  <line
                    key={index}
                    className={
                      selected
                        ? "lab-waveform-line selected"
                        : "lab-waveform-line"
                    }
                    x1={x}
                    x2={x}
                    y1={
                      40 -
                      halfHeight
                    }
                    y2={
                      40 +
                      halfHeight
                    }
                  />
                );
              }
            )}
          </svg>

          <div
            className="lab-trim-selection"
            style={{
              left:
                `${visualStartPercent}%`,

              width:
                `${selectionWidthPercent}%`,
            }}
          >
            <button
              type="button"
              className="lab-trim-handle start"
              data-trim-handle="left"
              aria-label="Move left selection edge"
              title="Left selection edge"
            />

            <button
              type="button"
              className="lab-trim-handle end"
              data-trim-handle="right"
              aria-label="Move right selection edge"
              title="Right selection edge"
            />
          </div>

          {loopEnabled && (
            <div
              className="lab-loop-region"
              style={{
                left:
                  `${visualLoopStartPercent}%`,

                width:
                  `${loopWidthPercent}%`,
              }}
            >
              <button
                type="button"
                className="lab-loop-handle start"
                data-loop-handle="left"
                aria-label="Move loop start"
                title="Loop start"
              >
                <span>
                  L
                </span>
              </button>

              <span className="lab-loop-label">
                LOOP
              </span>

              <button
                type="button"
                className="lab-loop-handle end"
                data-loop-handle="right"
                aria-label="Move loop end"
                title="Loop end"
              >
                <span>
                  R
                </span>
              </button>
            </div>
          )}
          </div>
        </div>

        <div className="lab-selection-hint">
          Drag across the waveform to select a region.
          Reverse flips the whole waveform, and the
          selection behaves exactly the same on the
          reversed view.
        </div>

        <div className="lab-selection-readout">
          <label>
            In

            <input
              type="number"
              min="0"
              max={
                Math.max(
                  0,
                  visualEndTime -
                    MIN_SELECTION_SECONDS
                )
              }
              step="0.001"
              value={
                visualStartTime.toFixed(
                  3
                )
              }
              onChange={(event) => {
                const next =
                  Number(
                    event.target.value
                  );

                if (
                  !Number.isFinite(
                    next
                  )
                ) {
                  return;
                }

                setSelectionFromVisualRange(
                  Math.max(
                    0,
                    Math.min(
                      next,
                      visualEndTime -
                        MIN_SELECTION_SECONDS
                    )
                  ),
                  visualEndTime
                );
              }}
            />
            <span>s</span>
          </label>

          <label>
            Out

            <input
              type="number"
              min={
                visualStartTime +
                MIN_SELECTION_SECONDS
              }
              max={
                duration
              }
              step="0.001"
              value={
                visualEndTime.toFixed(
                  3
                )
              }
              onChange={(event) => {
                const next =
                  Number(
                    event.target.value
                  );

                if (
                  !Number.isFinite(
                    next
                  )
                ) {
                  return;
                }

                setSelectionFromVisualRange(
                  visualStartTime,
                  Math.min(
                    duration,
                    Math.max(
                      next,
                      visualStartTime +
                        MIN_SELECTION_SECONDS
                    )
                  )
                );
              }}
            />
            <span>s</span>
          </label>

          <div className="lab-selection-length">
            <span>
              Length
            </span>

            <strong>
              {(
                endTime -
                startTime
              ).toFixed(3)}
              s
            </strong>
          </div>
        </div>

        <div className="lab-effect-row">
          <span>
            Reverse
          </span>

          <button
            className={
              reverse
                ? "lab-effect-button active"
                : "lab-effect-button"
            }
            onClick={() => {
              stopPreview();

              setReverse(
                (current) =>
                  !current
              );
            }}
          >
            {reverse
              ? "Reverse ON"
              : "Reverse OFF"}
          </button>
        </div>

        <div className="lab-effect-row lab-loop-row">
          <span>
            Loop
          </span>

          <button
            className={
              loopEnabled
                ? "lab-effect-button active"
                : "lab-effect-button"
            }
            onClick={() => {
              stopPreview();

              if (!loopEnabled) {
                /*
                  First activation starts with the
                  whole Trim selection as the loop,
                  just like dropping loop markers
                  around the currently edited clip.
                */
                setLoopStartTime(
                  startTime
                );

                setLoopEndTime(
                  endTime
                );
              }

              setLoopEnabled(
                (current) =>
                  !current
              );
            }}
          >
            {loopEnabled
              ? "Loop ON"
              : "Loop OFF"}
          </button>

          {loopEnabled && (
            <>
              <button
                type="button"
                className={
                  autoSmoothLoop
                    ? "lab-loop-smooth-button active"
                    : "lab-loop-smooth-button"
                }
                onClick={() => {
                  stopPreview();

                  setAutoSmoothLoop(
                    (current) =>
                      !current
                  );
                }}
                title="Nudge loop boundaries to nearby quiet / zero-crossing points"
              >
                Auto Smooth
                {autoSmoothLoop
                  ? " ON"
                  : " OFF"}
              </button>

              <label className="lab-loop-number lab-loop-xfade">
                <span>
                  XFade
                </span>

                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={
                    loopCrossfadeMs
                  }
                  onChange={(event) => {
                    const next =
                      Math.max(
                        0,
                        Math.min(
                          100,
                          Number(
                            event.target.value
                          ) || 0
                        )
                      );

                    stopPreview();

                    setLoopCrossfadeMs(
                      next
                    );
                  }}
                />

                <span>
                  ms
                </span>
              </label>
              <label className="lab-loop-number">
                <span>
                  Start
                </span>

                <input
                  type="number"
                  min="0"
                  max={
                    Math.max(
                      0,
                      outputLoopEnd -
                        MIN_LOOP_SECONDS
                    )
                  }
                  step="0.001"
                  value={
                    Math.max(
                      0,
                      outputLoopStart
                    ).toFixed(3)
                  }
                  onChange={(event) => {
                    const next =
                      Number(
                        event.target.value
                      );

                    if (
                      !Number.isFinite(
                        next
                      )
                    ) {
                      return;
                    }

                    setLoopFromVisualRange(
                      visualStartTime +
                        Math.max(
                          0,
                          Math.min(
                            next,
                            outputLoopEnd -
                              MIN_LOOP_SECONDS
                          )
                        ),
                      visualStartTime +
                        outputLoopEnd
                    );
                  }}
                />

                <span>
                  s
                </span>
              </label>

              <label className="lab-loop-number">
                <span>
                  End
                </span>

                <input
                  type="number"
                  min={
                    outputLoopStart +
                    MIN_LOOP_SECONDS
                  }
                  max={
                    endTime -
                    startTime
                  }
                  step="0.001"
                  value={
                    Math.max(
                      0,
                      outputLoopEnd
                    ).toFixed(3)
                  }
                  onChange={(event) => {
                    const next =
                      Number(
                        event.target.value
                      );

                    if (
                      !Number.isFinite(
                        next
                      )
                    ) {
                      return;
                    }

                    const selectionDuration =
                      endTime -
                      startTime;

                    setLoopFromVisualRange(
                      visualStartTime +
                        outputLoopStart,
                      visualStartTime +
                        Math.min(
                          selectionDuration,
                          Math.max(
                            next,
                            outputLoopStart +
                              MIN_LOOP_SECONDS
                          )
                        )
                    );
                  }}
                />

                <span>
                  s
                </span>
              </label>

              <button
                type="button"
                className="lab-loop-reset"
                onClick={() => {
                  stopPreview();

                  setLoopStartTime(
                    startTime
                  );

                  setLoopEndTime(
                    endTime
                  );
                }}
              >
                Reset Loop
              </button>
            </>
          )}
        </div>

        <div className="lab-actions">
          <button
            onClick={
              handlePlaySelection
            }
          >
            {loopEnabled
              ? "▶ Preview Loop"
              : "▶ Preview"}
          </button>

          {isPreviewing && (
            <button
              onClick={
                stopPreview
              }
            >
              ■ Stop
            </button>
          )}

          <button
            onClick={() => {
              stopPreview();

              setStartTime(0);

              setEndTime(
                sample.durationSeconds
              );

              setLoopStartTime(
                0
              );

              setLoopEndTime(
                sample.durationSeconds
              );
            }}
          >
            Reset Selection
          </button>

          {editingRackSlotIndex !==
            null && (
            <button
              className="rack-from-lab-button update-rack-sound-button"
              onClick={
                handleUpdateRackSound
              }
              disabled={
                isUpdatingRack ||
                isAddingToRack ||
                isOpeningMelodic ||
                isRendering
              }
            >
              {isUpdatingRack
                ? "Updating..."
                : "Update Rack Sound"}
            </button>
          )}

          <button
            className="rack-from-lab-button"
            onClick={
              handleAddCurrentEditToRack
            }
            disabled={
              isAddingToRack ||
              isUpdatingRack ||
              isOpeningMelodic ||
              isRendering
            }
          >
            {isAddingToRack
              ? "Preparing..."
              : editingRackSlotIndex !==
                  null
                ? "Add as New Rack Sound"
                : "Add to Drum Rack"}
          </button>

          <button
            className="rack-from-lab-button"
            onClick={
              handleOpenCurrentEditInMelodic
            }
            disabled={
              isOpeningMelodic ||
              isAddingToRack ||
              isUpdatingRack ||
              isRendering
            }
          >
            {isOpeningMelodic
              ? "Preparing..."
              : "Open Current Edit in Melodic Sampler"}
          </button>

          <button
            className="render-button"
            onClick={
              handleRender
            }
            disabled={
              isRendering ||
              isAddingToRack ||
              isUpdatingRack ||
              isOpeningMelodic
            }
          >
            {isRendering
              ? "Rendering..."
              : "Render New WAV"}
          </button>
        </div>

        {rackMessage && (
          <div className="lab-rack-result">
            {rackMessage}
          </div>
        )}

        {renderError && (
          <div className="lab-render-error">
            {renderError}
          </div>
        )}

        {renderedPath && (
          <div className="lab-render-result">
            <strong>
              ✓ Render complete
            </strong>

            {renderedSampleId !==
              null && (
              <span>
                Added to
                SampleVault as
                sample #
                {
                  renderedSampleId
                }
              </span>
            )}

            <span>
              {renderedPath}
            </span>
          </div>
        )}

        <div className="lab-tags">
          {sample.tags.map(
            (tag) => (
              <span
                className="tag-chip"
                key={tag}
              >
                {tag}
              </span>
            )
          )}
        </div>

        <audio
          ref={audioRef}
          preload="auto"
          src={`http://localhost:5085/api/samples/${sample.id}/audio`}
        />
      </section>
    </main>
  );
}

export default LabView;