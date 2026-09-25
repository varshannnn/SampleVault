import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type React from "react";

import "./App.css";

export type MelodicSamplerSound = {
  sourceId: string;

  sourceKind:
    | "library"
    | "temporary"
    | "savedPreset";

  sampleId?:
    | number
    | null;

  tempId:
    | string
    | null;

  savedPresetId?:
    | string
    | null;

  presetName?:
    | string
    | null;

  fileName: string;
  durationSeconds: number;
  tags: string[];
  audioUrl: string;

  /*
    Optional loop region supplied by the Lab.
    Values are relative to THIS audio file.
    If omitted, Loop While Held uses the whole clip.
  */
  loopStartSeconds?: number;
  loopEndSeconds?: number;

  loopCrossfadeMs?: number;
  loopAutoSmooth?: boolean;

  /*
    Saved melodic presets can hydrate the complete
    instrument state when loaded.
  */
  rootMidiNote?: number;
  transposeSemitones?: number;
  fineTuneCents?: number;

  voiceMode?:
    | "mono"
    | "poly";

  glideMs?: number;
  loopWhileHeld?: boolean;

  attackMs?: number;
  decayMs?: number;
  sustainPercent?: number;
  releaseMs?: number;
  gainDb?: number;
};

type MelodicSamplerProps = {
  sound: MelodicSamplerSound;

  onBack: () => void;

  onOpenLab?:
    () => void;

  onLoadPreset: (
    sound: MelodicSamplerSound
  ) => void;
};

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const KEYBOARD_NOTES = [
  {
    key: "a",
    offset: 0,
  },
  {
    key: "w",
    offset: 1,
  },
  {
    key: "s",
    offset: 2,
  },
  {
    key: "e",
    offset: 3,
  },
  {
    key: "d",
    offset: 4,
  },
  {
    key: "f",
    offset: 5,
  },
  {
    key: "t",
    offset: 6,
  },
  {
    key: "g",
    offset: 7,
  },
  {
    key: "y",
    offset: 8,
  },
  {
    key: "h",
    offset: 9,
  },
  {
    key: "u",
    offset: 10,
  },
  {
    key: "j",
    offset: 11,
  },
  {
    key: "k",
    offset: 12,
  },
];

function midiNoteName(
  note: number
) {
  const name =
    NOTE_NAMES[
      note % 12
    ];

  /*
    Same convention we've been using for
    Drum Rack / Ableton-style note labels:
    MIDI 36 = C1, MIDI 60 = C3.
  */
  const octave =
    Math.floor(
      note / 12
    ) - 2;

  return `${name}${octave}`;
}

function buildRootOptions() {
  const options: Array<{
    midi: number;
    label: string;
  }> = [];

  /*
    C0 through B6 gives plenty of useful
    root-note range for normal samples.
  */
  for (
    let midi = 24;
    midi <= 107;
    midi++
  ) {
    options.push({
      midi,
      label:
        midiNoteName(midi),
    });
  }

  return options;
}

const ROOT_OPTIONS =
  buildRootOptions();

type KnobProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;

  /*
    curve > 1 gives much more resolution near the
    low end. This is useful for envelope times:
    0-300 ms gets more physical knob travel even
    though the control can still reach several
    seconds.
  */
  curve?: number;

  disabled?: boolean;
  warning?: string | null;
};

function Knob({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  curve = 1,
  disabled = false,
  warning = null,
}: KnobProps) {
  const dragRef =
    useRef<{
      startY: number;
      startNormalized: number;
    } | null>(null);

  const clamp = (
    next: number
  ) =>
    Math.max(
      min,
      Math.min(
        max,
        next
      )
    );

  const roundToStep = (
    next: number
  ) => {
    const rounded =
      Math.round(
        (
          next -
          min
        ) /
          step
      ) *
        step +
      min;

    /*
      Avoid ugly floating point values such as
      0.4999999997 when a knob uses 0.5 dB steps.
    */
    const decimals =
      step < 1
        ? Math.max(
            0,
            (
              step.toString()
                .split(".")[1] ??
              ""
            ).length
          )
        : 0;

    return Number(
      clamp(
        rounded
      ).toFixed(
        decimals
      )
    );
  };

  const toNormalized = (
    next: number
  ) => {
    if (
      max === min
    ) {
      return 0;
    }

    const raw =
      Math.max(
        0,
        Math.min(
          1,
          (
            next -
            min
          ) /
            (
              max -
              min
            )
        )
      );

    return Math.pow(
      raw,
      1 / curve
    );
  };

  const fromNormalized = (
    normalized: number
  ) => {
    const shaped =
      Math.pow(
        Math.max(
          0,
          Math.min(
            1,
            normalized
          )
        ),
        curve
      );

    return roundToStep(
      min +
        (
          max -
          min
        ) *
          shaped
    );
  };

  const normalized =
    toNormalized(
      value
    );

  const angle =
    -135 +
    normalized *
      270;

  const handlePointerDown = (
    event:
      React.PointerEvent<
        HTMLDivElement
      >
  ) => {
    if (disabled) {
      return;
    }

    event.preventDefault();

    event.currentTarget
      .setPointerCapture(
        event.pointerId
      );

    dragRef.current = {
      startY:
        event.clientY,

      startNormalized:
        normalized,
    };
  };

  const handlePointerMove = (
    event:
      React.PointerEvent<
        HTMLDivElement
      >
  ) => {
    const drag =
      dragRef.current;

    if (
      disabled ||
      !drag
    ) {
      return;
    }

    const delta =
      (
        drag.startY -
        event.clientY
      ) /
      150;

    onChange(
      fromNormalized(
        drag.startNormalized +
          delta
      )
    );
  };

  const handlePointerUp = (
    event:
      React.PointerEvent<
        HTMLDivElement
      >
  ) => {
    dragRef.current =
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

  const handleKeyDown = (
    event:
      React.KeyboardEvent<
        HTMLDivElement
      >
  ) => {
    if (disabled) {
      return;
    }

    let direction = 0;

    if (
      event.key ===
        "ArrowUp" ||
      event.key ===
        "ArrowRight"
    ) {
      direction = 1;
    }

    if (
      event.key ===
        "ArrowDown" ||
      event.key ===
        "ArrowLeft"
    ) {
      direction = -1;
    }

    if (direction !== 0) {
      event.preventDefault();

      onChange(
        roundToStep(
          value +
            direction *
              step
        )
      );

      return;
    }

    if (
      event.key ===
      "Home"
    ) {
      event.preventDefault();
      onChange(min);
    }

    if (
      event.key ===
      "End"
    ) {
      event.preventDefault();
      onChange(max);
    }
  };

  return (
    <label
      className={[
        "melodic-knob-control",

        disabled
          ? "disabled"
          : "",
      ]
        .filter(
          Boolean
        )
        .join(" ")}
    >
      <span className="melodic-knob-label">
        {label}
      </span>

      <div
        className="melodic-knob"
        role="slider"
        tabIndex={
          disabled
            ? -1
            : 0
        }
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={
          disabled
        }
        onPointerDown={
          handlePointerDown
        }
        onPointerMove={
          handlePointerMove
        }
        onPointerUp={
          handlePointerUp
        }
        onPointerCancel={
          handlePointerUp
        }
        onKeyDown={
          handleKeyDown
        }
        title="Drag up/down, use arrow keys, or type a value below"
      >
        <div className="melodic-knob-face">
          <span
            className="melodic-knob-indicator"
            style={{
              transform:
                `translateX(-50%) rotate(${angle}deg)`,
            }}
          />
        </div>
      </div>

      <div className="melodic-knob-value">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={
            disabled
          }
          onChange={(event) => {
            const next =
              Number(
                event.target.value
              );

            if (
              Number.isFinite(
                next
              )
            ) {
              onChange(
                roundToStep(
                  next
                )
              );
            }
          }}
        />

        <span>
          {unit}
        </span>
      </div>

      {warning && (
        <small>
          {warning}
        </small>
      )}
    </label>
  );
}

function MelodicSampler({
  sound,
  onBack,
  onOpenLab,
  onLoadPreset,
}: MelodicSamplerProps) {
  const [
    rootMidiNote,
    setRootMidiNote,
  ] = useState(
    sound.rootMidiNote ??
      60
  );

  /*
    Global instrument tuning.

    Transpose = whole semitones.
    Fine tune = cents.
  */
  const [
    transposeSemitones,
    setTransposeSemitones,
  ] = useState(
    sound.transposeSemitones ??
      0
  );

  const [
    fineTuneCents,
    setFineTuneCents,
  ] = useState(
    sound.fineTuneCents ??
      0
  );

  /*
    Like Ableton's Computer MIDI Keyboard:
      Z -> octave down
      X -> octave up

    This affects computer-keyboard note entry
    only. A physical MIDI controller keeps
    sending its real MIDI note numbers.
  */
  const [
    keyboardOctaveShift,
    setKeyboardOctaveShift,
  ] = useState(0);

  const [
    voiceMode,
    setVoiceMode,
  ] = useState<
    "mono" | "poly"
  >(
    sound.voiceMode ??
      "mono"
  );

  /*
    The melodic sampler behaves like a sustained
    instrument by default: while the note is held,
    the source loops. On Note Off we disable looping
    and let the ADSR Release fade the current pass.
  */
  const [
    loopWhileHeld,
    setLoopWhileHeld,
  ] = useState(
    sound.loopWhileHeld ??
      true
  );

  const [
    loopAutoSmooth,
    setLoopAutoSmooth,
  ] = useState(
    sound.loopAutoSmooth ??
      true
  );

  const [
    loopCrossfadeMs,
    setLoopCrossfadeMs,
  ] = useState(
    sound.loopCrossfadeMs ??
      8
  );

  const [
    glideMs,
    setGlideMs,
  ] = useState(
    sound.glideMs ??
      80
  );

  const [
    attackMs,
    setAttackMs,
  ] = useState(
    sound.attackMs ??
      0
  );

  const [
    decayMs,
    setDecayMs,
  ] = useState(
    sound.decayMs ??
      180
  );

  const [
    sustainPercent,
    setSustainPercent,
  ] = useState(
    sound.sustainPercent ??
      100
  );

  const [
    releaseMs,
    setReleaseMs,
  ] = useState(
    sound.releaseMs ??
      120
  );

  const [
    gainDb,
    setGainDb,
  ] = useState(
    sound.gainDb ??
      0
  );

  const [
    showInstrumentMenu,
    setShowInstrumentMenu,
  ] = useState(false);

  type MelodicPresetListItem = {
    id: string;
    name: string;
    updatedAtUtc: string;
    fileName: string;
  };

  const [
    melodicPresets,
    setMelodicPresets,
  ] = useState<
    MelodicPresetListItem[]
  >([]);

  const [
    currentPresetId,
    setCurrentPresetId,
  ] = useState<
    string | null
  >(
    sound.savedPresetId ??
      null
  );

  const [
    presetName,
    setPresetName,
  ] = useState(
    sound.presetName ??
      ""
  );

  const [
    presetStatus,
    setPresetStatus,
  ] = useState("");

  const [
    presetBusy,
    setPresetBusy,
  ] = useState(false);

  const [
    midiEnabled,
    setMidiEnabled,
  ] = useState(false);

  const [
    midiStatus,
    setMidiStatus,
  ] = useState(
    "MIDI not enabled"
  );

  const [
    activeNotes,
    setActiveNotes,
  ] = useState<Set<number>>(
    () => new Set()
  );

  const [
    isReady,
    setIsReady,
  ] = useState(false);

  const audioContextRef =
    useRef<AudioContext | null>(
      null
    );

  const decodedBufferRef =
    useRef<AudioBuffer | null>(
      null
    );

  const loadingBufferRef =
    useRef<
      Promise<AudioBuffer> | null
    >(null);

  /*
    Crossfaded loop audio used to be rebuilt on every note.
    Cache one prepared loop buffer instead of copying the whole
    sample over and over while the instrument is being played.
  */
  const preparedLoopCacheRef =
    useRef<{
      sourceBuffer: AudioBuffer;
      autoSmooth: boolean;
      crossfadeMs: number;
      requestedStart: number;
      requestedEnd: number;
      value: {
        buffer: AudioBuffer;
        loopStart: number;
        loopEnd: number;
      };
    } | null>(null);

  /*
    Guard async note starts. A quick key-down/key-up can otherwise
    release BEFORE the first decode finishes, leaving a hidden loop
    voice that never receives its Note Off.
  */
  const pendingNoteOnRef =
    useRef<
      Map<number, number>
    >(new Map());

  const noteRequestSerialRef =
    useRef(0);

  const midiAccessRef =
    useRef<MIDIAccess | null>(
      null
    );

  /*
    MIDI callbacks are attached to browser MIDI
    inputs and can outlive a React render. Refs
    ensure they always use the newest instrument
    settings.
  */
  const rootMidiNoteRef =
    useRef(rootMidiNote);

  const transposeRef =
    useRef(
      transposeSemitones
    );

  const fineTuneRef =
    useRef(
      fineTuneCents
    );

  const voiceModeRef =
    useRef<
      "mono" | "poly"
    >(
      voiceMode
    );

  const loopWhileHeldRef =
    useRef(
      loopWhileHeld
    );

  const loopAutoSmoothRef =
    useRef(
      loopAutoSmooth
    );

  const loopCrossfadeMsRef =
    useRef(
      loopCrossfadeMs
    );

  const glideMsRef =
    useRef(glideMs);

  const attackMsRef =
    useRef(attackMs);

  const decayMsRef =
    useRef(decayMs);

  const sustainPercentRef =
    useRef(
      sustainPercent
    );

  const releaseMsRef =
    useRef(releaseMs);

  const gainDbRef =
    useRef(gainDb);

  /*
    Remember which actual note each computer key
    started so key-up still stops the correct note
    even if Z/X changes octave while a key is down.
  */
  const pressedComputerNotesRef =
    useRef<
      Map<string, number>
    >(
      new Map()
    );

  useEffect(() => {
    rootMidiNoteRef.current =
      rootMidiNote;
  }, [rootMidiNote]);

  useEffect(() => {
    transposeRef.current =
      transposeSemitones;
  }, [transposeSemitones]);

  useEffect(() => {
    fineTuneRef.current =
      fineTuneCents;
  }, [fineTuneCents]);

  useEffect(() => {
    voiceModeRef.current =
      voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    loopWhileHeldRef.current =
      loopWhileHeld;
  }, [loopWhileHeld]);

  useEffect(() => {
    loopAutoSmoothRef.current =
      loopAutoSmooth;
  }, [loopAutoSmooth]);

  useEffect(() => {
    loopCrossfadeMsRef.current =
      loopCrossfadeMs;
  }, [loopCrossfadeMs]);

  useEffect(() => {
    glideMsRef.current =
      glideMs;
  }, [glideMs]);

  useEffect(() => {
    attackMsRef.current =
      attackMs;
  }, [attackMs]);

  useEffect(() => {
    decayMsRef.current =
      decayMs;
  }, [decayMs]);

  useEffect(() => {
    sustainPercentRef.current =
      sustainPercent;
  }, [sustainPercent]);

  useEffect(() => {
    releaseMsRef.current =
      releaseMs;
  }, [releaseMs]);

  useEffect(() => {
    gainDbRef.current =
      gainDb;
  }, [gainDb]);

  type ActiveVoice = {
    source:
      AudioBufferSourceNode;

    /*
      Envelope and output gain are separate.

      envelopeGain = ADSR shape (0..1)
      outputGain   = MIDI velocity × user Gain dB

      Keeping them separate means changing Gain
      can affect a note that is ALREADY playing.
    */
    envelopeGain:
      GainNode;

    outputGain:
      GainNode;

    note: number;
    velocity: number;
  };

  /*
    Poly mode owns one independent voice for
    each MIDI note.
  */
  const polyVoicesRef =
    useRef<
      Map<
        number,
        ActiveVoice
      >
    >(
      new Map()
    );

  /*
    Mono mode keeps one continuously pitched
    voice. Changing notes can glide the same
    AudioBufferSourceNode instead of retriggering.
  */
  const monoVoiceRef =
    useRef<
      ActiveVoice | null
    >(
      null
    );

  /*
    In Mono mode, remember held-note order so
    releasing the newest note can fall back to
    the previously held note.
  */
  const monoHeldNotesRef =
    useRef<number[]>(
      []
    );

  const getAudioContext =
    () => {
      if (
        !audioContextRef.current
      ) {
        audioContextRef.current =
          new AudioContext({
            latencyHint:
              "interactive",
          });
      }

      return audioContextRef.current;
    };

  const getDecodedBuffer =
    async (): Promise<AudioBuffer> => {
      if (
        decodedBufferRef.current
      ) {
        return decodedBufferRef.current;
      }

      if (
        loadingBufferRef.current
      ) {
        return loadingBufferRef.current;
      }

      const loading =
        (async () => {
          const response =
            await fetch(
              sound.audioUrl
            );

          if (!response.ok) {
            throw new Error(
              `Failed to load ${sound.fileName}`
            );
          }

          const rawAudio =
            await response.arrayBuffer();

          const context =
            getAudioContext();

          const decoded =
            await context.decodeAudioData(
              rawAudio
            );

          decodedBufferRef.current =
            decoded;

          loadingBufferRef.current =
            null;

          setIsReady(true);

          return decoded;
        })();

      loadingBufferRef.current =
        loading;

      return loading;
    };

  /*
    Native AudioBufferSource looping is sample
    accurate, but it can still click if Loop End
    jumps to a very different sample value at
    Loop Start.

    Automatically move each boundary to the
    quietest nearby frame (~zero crossing). The
    search is intentionally tiny so the musical
    loop point still feels exactly where the user
    put it in the Lab.
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
        score =
          Math.max(
            score,
            Math.abs(
              buffer.getChannelData(
                channel
              )[frame]
            )
          );
      }

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

  type PreparedSamplerLoop = {
    buffer: AudioBuffer;
    loopStart: number;
    loopEnd: number;
  };

  const prepareSamplerLoop = (
    sourceBuffer: AudioBuffer
  ): PreparedSamplerLoop => {
    const context =
      getAudioContext();

    const minimumLength =
      Math.min(
        0.005,
        sourceBuffer.duration
      );

    const requestedStart =
      sound.loopStartSeconds ??
      0;

    const requestedEnd =
      sound.loopEndSeconds ??
      sourceBuffer.duration;

    const safeStart =
      Math.max(
        0,
        Math.min(
          Math.max(
            0,
            sourceBuffer.duration -
              minimumLength
          ),
          requestedStart
        )
      );

    const safeEnd =
      Math.max(
        safeStart +
          minimumLength,
        Math.min(
          sourceBuffer.duration,
          requestedEnd
        )
      );

    let smoothStart =
      safeStart;

    let smoothEnd =
      safeEnd;

    if (
      loopAutoSmoothRef.current
    ) {
      smoothStart =
        snapLoopTimeToQuietFrame(
          sourceBuffer,
          safeStart
        );

      smoothEnd =
        snapLoopTimeToQuietFrame(
          sourceBuffer,
          safeEnd
        );

      if (
        smoothEnd -
          smoothStart <
        minimumLength
      ) {
        smoothStart =
          safeStart;

        smoothEnd =
          safeEnd;
      }
    }

    const sampleRate =
      sourceBuffer.sampleRate;

    const startFrame =
      Math.max(
        0,
        Math.min(
          sourceBuffer.length - 2,
          Math.round(
            smoothStart *
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
            smoothEnd *
              sampleRate
          )
        )
      );

    const loopFrames =
      endFrame -
      startFrame;

    const requestedCrossfadeFrames =
      Math.max(
        0,
        Math.round(
          (
            Math.max(
              0,
              loopCrossfadeMsRef.current
            ) /
            1000
          ) *
            sampleRate
        )
      );

    const crossfadeFrames =
      Math.min(
        requestedCrossfadeFrames,
        Math.max(
          0,
          Math.floor(
            loopFrames *
              0.25
          )
        )
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

    return {
      buffer:
        prepared,

      loopStart:
        (
          startFrame +
          crossfadeFrames
        ) /
        sampleRate,

      loopEnd:
        endFrame /
        sampleRate,
    };
  };

  const getPreparedSamplerLoop = (
    sourceBuffer: AudioBuffer
  ): PreparedSamplerLoop => {
    const requestedStart =
      sound.loopStartSeconds ??
      0;

    const requestedEnd =
      sound.loopEndSeconds ??
      sourceBuffer.duration;

    const autoSmooth =
      loopAutoSmoothRef.current;

    const crossfadeMs =
      loopCrossfadeMsRef.current;

    const cached =
      preparedLoopCacheRef.current;

    if (
      cached &&
      cached.sourceBuffer === sourceBuffer &&
      cached.autoSmooth === autoSmooth &&
      cached.crossfadeMs === crossfadeMs &&
      cached.requestedStart === requestedStart &&
      cached.requestedEnd === requestedEnd
    ) {
      return cached.value;
    }

    const value =
      prepareSamplerLoop(
        sourceBuffer
      );

    preparedLoopCacheRef.current = {
      sourceBuffer,
      autoSmooth,
      crossfadeMs,
      requestedStart,
      requestedEnd,
      value,
    };

    return value;
  };

  const API_BASE =
    "http://localhost:5085";

  const refreshPresetList =
    async () => {
      try {
        const response =
          await fetch(
            `${API_BASE}/api/melodic-presets`
          );

        if (!response.ok) {
          throw new Error(
            `Could not load presets (${response.status}).`
          );
        }

        const list =
          (
            await response.json()
          ) as MelodicPresetListItem[];

        setMelodicPresets(
          list
        );
      } catch (error) {
        console.error(
          "Failed to list melodic presets:",
          error
        );
      }
    };

  useEffect(() => {
    void refreshPresetList();
  }, []);

  const savePreset =
    async (
      saveAsNew: boolean
    ) => {
      const cleanName =
        presetName.trim();

      if (!cleanName) {
        setPresetStatus(
          "Enter a preset name."
        );

        return;
      }

      setPresetBusy(true);
      setPresetStatus("");

      try {
        let sourceKind:
          | "library"
          | "temporary"
          | "savedPreset";

        if (
          sound.sourceKind ===
          "savedPreset"
        ) {
          sourceKind =
            "savedPreset";
        } else {
          sourceKind =
            sound.sourceKind;
        }

        const response =
          await fetch(
            `${API_BASE}/api/melodic-presets`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                id:
                  saveAsNew
                    ? null
                    : currentPresetId,

                name:
                  cleanName,

                sourceKind,

                sampleId:
                  sound.sampleId ??
                  null,

                tempId:
                  sound.tempId,

                sourcePresetId:
                  sound.savedPresetId ??
                  null,

                fileName:
                  sound.fileName,

                durationSeconds:
                  sound.durationSeconds,

                tags:
                  sound.tags,

                rootMidiNote,
                transposeSemitones,
                fineTuneCents,

                voiceMode,
                glideMs,
                loopWhileHeld,

                hasCustomLoop:
                  sound.loopStartSeconds !==
                    undefined &&
                  sound.loopEndSeconds !==
                    undefined,

                loopStartSeconds:
                  sound.loopStartSeconds ??
                  0,

                loopEndSeconds:
                  sound.loopEndSeconds ??
                  sound.durationSeconds,

                loopAutoSmooth,
                loopCrossfadeMs,

                attackMs,
                decayMs,
                sustainPercent,
                releaseMs,
                gainDb,
              }),
            }
          );

        if (!response.ok) {
          const message =
            await response.text();

          throw new Error(
            message ||
            `Save failed (${response.status}).`
          );
        }

        const saved =
          (await response.json()) as {
            id: string;
            name: string;
          };

        setCurrentPresetId(
          saved.id
        );

        setPresetName(
          saved.name
        );

        setPresetStatus(
          saveAsNew
            ? "✓ Saved new preset"
            : "✓ Preset saved"
        );

        await refreshPresetList();
      } catch (error) {
        setPresetStatus(
          error instanceof Error
            ? error.message
            : "Preset save failed."
        );
      } finally {
        setPresetBusy(false);
      }
    };

  const loadPreset =
    async (
      presetId: string
    ) => {
      if (!presetId) {
        return;
      }

      stopAllNotes(
        true
      );

      setPresetBusy(true);
      setPresetStatus("");

      try {
        const response =
          await fetch(
            `${API_BASE}/api/melodic-presets/${presetId}`
          );

        if (!response.ok) {
          throw new Error(
            `Could not load preset (${response.status}).`
          );
        }

        const payload =
          (await response.json()) as {
            id: string;
            name: string;
            sound: MelodicSamplerSound;
          };

        /*
          Controller returns a relative /api/... audio URL.
          Make it absolute because the React dev server is on
          a different port.
        */
        const loadedSound = {
          ...payload.sound,
          audioUrl:
            payload.sound.audioUrl.startsWith(
              "http"
            )
              ? payload.sound.audioUrl
              : `${API_BASE}${payload.sound.audioUrl}`,
        };

        onLoadPreset(
          loadedSound
        );
      } catch (error) {
        setPresetStatus(
          error instanceof Error
            ? error.message
            : "Preset load failed."
        );

        setPresetBusy(false);
      }
    };

  const deleteCurrentPreset =
    async () => {
      if (!currentPresetId) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete preset "${presetName}"?`
        );

      if (!confirmed) {
        return;
      }

      setPresetBusy(true);

      try {
        const response =
          await fetch(
            `${API_BASE}/api/melodic-presets/${currentPresetId}`,
            {
              method: "DELETE",
            }
          );

        if (!response.ok) {
          throw new Error(
            `Delete failed (${response.status}).`
          );
        }

        setCurrentPresetId(
          null
        );

        setPresetName("");
        setPresetStatus(
          "Preset deleted."
        );

        await refreshPresetList();
      } catch (error) {
        setPresetStatus(
          error instanceof Error
            ? error.message
            : "Preset delete failed."
        );
      } finally {
        setPresetBusy(false);
      }
    };

  /*
    Preload as soon as the sampler view opens,
    so MIDI/key presses take the fast path.
  */
  useEffect(() => {
    decodedBufferRef.current =
      null;

    loadingBufferRef.current =
      null;

    preparedLoopCacheRef.current =
      null;

    pendingNoteOnRef.current
      .clear();

    setLoopAutoSmooth(
      sound.loopAutoSmooth ??
        true
    );

    setLoopCrossfadeMs(
      sound.loopCrossfadeMs ??
        8
    );

    loopAutoSmoothRef.current =
      sound.loopAutoSmooth ??
      true;

    loopCrossfadeMsRef.current =
      sound.loopCrossfadeMs ??
      8;

    setIsReady(false);

    void getDecodedBuffer()
      .catch((error) => {
        console.error(
          "Failed to prepare Melodic Sampler audio:",
          error
        );
      });
  }, [sound.sourceId]);

  const markNoteActive = (
    note: number
  ) => {
    setActiveNotes(
      (current) => {
        const updated =
          new Set(current);

        updated.add(note);

        return updated;
      }
    );
  };

  const markNoteInactive = (
    note: number
  ) => {
    setActiveNotes(
      (current) => {
        const updated =
          new Set(current);

        updated.delete(note);

        return updated;
      }
    );
  };

  const playbackRateForNote = (
    midiNote: number
  ) => {
    const totalSemitones =
      midiNote -
      rootMidiNoteRef.current +
      transposeRef.current +
      fineTuneRef.current /
        100;

    return Math.pow(
      2,
      totalSemitones /
        12
    );
  };

  const dbToLinear = (
    db: number
  ) => {
    return Math.pow(
      10,
      db / 20
    );
  };

  const velocityToLinear = (
    velocity: number
  ) => {
    return Math.max(
      0,
      Math.min(
        1,
        velocity / 127
      )
    );
  };

  const outputGainForVoice = (
    velocity: number
  ) => {
    return (
      velocityToLinear(
        velocity
      ) *
      dbToLinear(
        gainDbRef.current
      )
    );
  };

  const setVoiceOutputGain = (
    voice: ActiveVoice,
    db: number,
    smooth = true
  ) => {
    const context =
      getAudioContext();

    const now =
      context.currentTime;

    const target =
      velocityToLinear(
        voice.velocity
      ) *
      dbToLinear(db);

    voice.outputGain.gain
      .cancelScheduledValues(
        now
      );

    if (!smooth) {
      voice.outputGain.gain
        .setValueAtTime(
          target,
          now
        );

      return;
    }

    voice.outputGain.gain
      .setTargetAtTime(
        target,
        now,
        0.008
      );
  };

  const applyGainToActiveVoices = (
    db: number
  ) => {
    for (
      const voice of
      polyVoicesRef.current
        .values()
    ) {
      setVoiceOutputGain(
        voice,
        db
      );
    }

    if (
      monoVoiceRef.current
    ) {
      setVoiceOutputGain(
        monoVoiceRef.current,
        db
      );
    }
  };

  const applyAdsrStart = (
    envelopeGain: GainNode
  ) => {
    const context =
      getAudioContext();

    const now =
      context.currentTime;

    const attackSeconds =
      Math.max(
        0,
        attackMsRef.current
      ) /
      1000;

    const decaySeconds =
      Math.max(
        0,
        decayMsRef.current
      ) /
      1000;

    const sustainLevel =
      Math.max(
        0,
        Math.min(
          1,
          sustainPercentRef.current /
            100
        )
      );

    envelopeGain.gain
      .cancelScheduledValues(
        now
      );

    envelopeGain.gain
      .setValueAtTime(
        0,
        now
      );

    const attackEnd =
      now +
      attackSeconds;

    if (
      attackSeconds <= 0
    ) {
      envelopeGain.gain
        .setValueAtTime(
          1,
          now
        );
    } else {
      envelopeGain.gain
        .linearRampToValueAtTime(
          1,
          attackEnd
        );
    }

    const decayStart =
      attackSeconds <= 0
        ? now
        : attackEnd;

    if (
      decaySeconds <= 0
    ) {
      envelopeGain.gain
        .setValueAtTime(
          sustainLevel,
          decayStart
        );
    } else {
      envelopeGain.gain
        .linearRampToValueAtTime(
          sustainLevel,
          decayStart +
            decaySeconds
        );
    }
  };

  const releaseVoice = (
    voice: ActiveVoice,
    releaseOverrideMs?: number
  ) => {
    /*
      Stop scheduling NEW loop passes at Note Off.
      The current pass can continue underneath the
      release envelope, so the tail feels natural.
    */
    voice.source.loop =
      false;

    const context =
      getAudioContext();

    const now =
      context.currentTime;

    const releaseSeconds =
      Math.max(
        0,
        releaseOverrideMs ??
          releaseMsRef.current
      ) /
      1000;

    try {
      voice.envelopeGain.gain
        .cancelAndHoldAtTime(
          now
        );
    } catch {
      voice.envelopeGain.gain
        .cancelScheduledValues(
          now
        );
    }

    if (
      releaseSeconds <= 0
    ) {
      voice.envelopeGain.gain
        .setValueAtTime(
          0,
          now
        );

      try {
        voice.source.stop();
      } catch {
        // Already ended.
      }

      return;
    }

    voice.envelopeGain.gain
      .linearRampToValueAtTime(
        0,
        now +
          releaseSeconds
      );

    try {
      voice.source.stop(
        now +
          releaseSeconds +
          0.02
      );
    } catch {
      // Already ended.
    }
  };

  const stopAllNotes = (
    immediate = true
  ) => {
    pendingNoteOnRef.current
      .clear();

    for (
      const voice of
      polyVoicesRef.current
        .values()
    ) {
      releaseVoice(
        voice,
        immediate
          ? 0
          : undefined
      );
    }

    polyVoicesRef.current
      .clear();

    if (
      monoVoiceRef.current
    ) {
      releaseVoice(
        monoVoiceRef.current,
        immediate
          ? 0
          : undefined
      );

      monoVoiceRef.current =
        null;
    }

    monoHeldNotesRef.current =
      [];

    pressedComputerNotesRef.current
      .clear();

    setActiveNotes(
      new Set()
    );
  };

  const retuneMonoVoice = (
    midiNote: number,
    velocity = 127
  ) => {
    const voice =
      monoVoiceRef.current;

    if (!voice) {
      return false;
    }

    const context =
      getAudioContext();

    const now =
      context.currentTime;

    const targetRate =
      playbackRateForNote(
        midiNote
      );

    const glideSeconds =
      Math.max(
        0,
        glideMsRef.current
      ) /
      1000;

    try {
      voice.source.playbackRate
        .cancelAndHoldAtTime(
          now
        );
    } catch {
      voice.source.playbackRate
        .cancelScheduledValues(
          now
        );

      voice.source.playbackRate
        .setValueAtTime(
          voice.source
            .playbackRate
            .value,
          now
        );
    }

    if (
      glideSeconds > 0 &&
      voice.note !==
        midiNote
    ) {
      voice.source.playbackRate
        .exponentialRampToValueAtTime(
          Math.max(
            0.0001,
            targetRate
          ),
          now +
            glideSeconds
        );
    } else {
      voice.source.playbackRate
        .setValueAtTime(
          targetRate,
          now
        );
    }

    /*
      Let the newest MIDI velocity influence
      the current mono voice without retriggering
      its ADSR envelope.
    */
    voice.velocity =
      velocity;

    setVoiceOutputGain(
      voice,
      gainDbRef.current
    );

    voice.note =
      midiNote;

    return true;
  };

  const noteOff = (
    midiNote: number
  ) => {
    pendingNoteOnRef.current
      .delete(
        midiNote
      );

    markNoteInactive(
      midiNote
    );

    if (
      voiceModeRef.current ===
      "poly"
    ) {
      const voice =
        polyVoicesRef.current
          .get(
            midiNote
          );

      if (!voice) {
        return;
      }

      polyVoicesRef.current
        .delete(
          midiNote
        );

      releaseVoice(
        voice
      );

      return;
    }

    monoHeldNotesRef.current =
      monoHeldNotesRef.current
        .filter(
          (note) =>
            note !==
            midiNote
        );

    const voice =
      monoVoiceRef.current;

    if (!voice) {
      return;
    }

    /*
      Releasing a non-current held key should
      not interrupt the note we're hearing.
    */
    if (
      voice.note !==
      midiNote
    ) {
      return;
    }

    const fallbackNote =
      monoHeldNotesRef.current[
        monoHeldNotesRef.current
          .length -
        1
      ];

    if (
      fallbackNote !==
      undefined
    ) {
      retuneMonoVoice(
        fallbackNote,
        127
      );

      return;
    }

    monoVoiceRef.current =
      null;

    releaseVoice(
      voice
    );
  };

  const noteOn =
    async (
      midiNote: number,
      velocity = 127
    ) => {
      const requestId =
        ++noteRequestSerialRef.current;

      pendingNoteOnRef.current
        .set(
          midiNote,
          requestId
        );

      const context =
        getAudioContext();

      if (
        context.state ===
        "suspended"
      ) {
        await context.resume();
      }

      const buffer =
        await getDecodedBuffer();

      if (
        pendingNoteOnRef.current
          .get(
            midiNote
          ) !==
        requestId
      ) {
        return;
      }

      pendingNoteOnRef.current
        .delete(
          midiNote
        );

      markNoteActive(
        midiNote
      );

      if (
        voiceModeRef.current ===
        "mono"
      ) {
        /*
          Move this note to the end of the
          held-note stack so it has priority.
        */
        monoHeldNotesRef.current =
          monoHeldNotesRef.current
            .filter(
              (note) =>
                note !==
                midiNote
            );

        monoHeldNotesRef.current
          .push(
            midiNote
          );

        const existingVoice =
          monoVoiceRef.current;

        if (
          existingVoice &&
          existingVoice.note !==
            midiNote
        ) {
          retuneMonoVoice(
            midiNote,
            velocity
          );

          return;
        }

        /*
          Repeated Note On of the exact same
          note retriggers the sample.
        */
        if (existingVoice) {
          releaseVoice(
            existingVoice,
            5
          );

          monoVoiceRef.current =
            null;
        }

        const source =
          context.createBufferSource();

        const envelopeGain =
          context.createGain();

        const outputGain =
          context.createGain();

        const preparedLoop =
          loopWhileHeldRef.current
            ? getPreparedSamplerLoop(
                buffer
              )
            : {
                buffer,
                loopStart: 0,
                loopEnd:
                  buffer.duration,
              };

        source.buffer =
          preparedLoop.buffer;

        source.loop =
          loopWhileHeldRef.current;

        source.loopStart =
          preparedLoop.loopStart;

        source.loopEnd =
          preparedLoop.loopEnd;

        source.playbackRate.value =
          playbackRateForNote(
            midiNote
          );

        const voice:
          ActiveVoice = {
          source,
          envelopeGain,
          outputGain,
          note:
            midiNote,
          velocity,
        };

        applyAdsrStart(
          envelopeGain
        );

        setVoiceOutputGain(
          voice,
          gainDbRef.current,
          false
        );

        source.connect(
          envelopeGain
        );

        envelopeGain.connect(
          outputGain
        );

        outputGain.connect(
          context.destination
        );

        monoVoiceRef.current =
          voice;

        source.onended = () => {
          if (
            monoVoiceRef.current
              ?.source ===
            source
          ) {
            monoVoiceRef.current =
              null;
          }

          try {
            source.disconnect();
            envelopeGain.disconnect();
            outputGain.disconnect();
          } catch {
            // Already disconnected.
          }
        };

        source.start();

        return;
      }

      /*
        POLY: every note gets an independent
        source + envelope.
      */
      const previousVoice =
        polyVoicesRef.current
          .get(
            midiNote
          );

      if (previousVoice) {
        releaseVoice(
          previousVoice,
          5
        );

        polyVoicesRef.current
          .delete(
            midiNote
          );
      }

      const source =
        context.createBufferSource();

      const envelopeGain =
        context.createGain();

      const outputGain =
        context.createGain();

      const preparedLoop =
        loopWhileHeldRef.current
          ? getPreparedSamplerLoop(
              buffer
            )
          : {
              buffer,
              loopStart: 0,
              loopEnd:
                buffer.duration,
            };

      source.buffer =
        preparedLoop.buffer;

      source.loop =
        loopWhileHeldRef.current;

      source.loopStart =
        preparedLoop.loopStart;

      source.loopEnd =
        preparedLoop.loopEnd;

      source.playbackRate.value =
        playbackRateForNote(
          midiNote
        );

      const voice:
        ActiveVoice = {
        source,
        envelopeGain,
        outputGain,
        note:
          midiNote,
        velocity,
      };

      applyAdsrStart(
        envelopeGain
      );

      setVoiceOutputGain(
        voice,
        gainDbRef.current,
        false
      );

      source.connect(
        envelopeGain
      );

      envelopeGain.connect(
        outputGain
      );

      outputGain.connect(
        context.destination
      );

      polyVoicesRef.current.set(
        midiNote,
        voice
      );

      source.onended = () => {
        if (
          polyVoicesRef.current
            .get(
              midiNote
            )
            ?.source ===
          source
        ) {
          polyVoicesRef.current
            .delete(
              midiNote
            );

          markNoteInactive(
            midiNote
          );
        }

        try {
          source.disconnect();
          envelopeGain.disconnect();
          outputGain.disconnect();
        } catch {
          // Already disconnected.
        }
      };

      source.start();
    };

  /*
    Computer MIDI Keyboard:

      A W S E D F T G Y H U J K
      Z = octave down
      X = octave up

    Z/X mirror Ableton's octave-shift behavior.
  */
  useEffect(() => {
    const handleKeyDown =
      (event: KeyboardEvent) => {
        if (event.repeat) {
          return;
        }

        const target =
          event.target as
            HTMLElement | null;

        /*
          Number/range controls should not disable the computer
          MIDI keyboard after editing. Only suppress note shortcuts
          when the user is actually typing text or using a select.
        */
        if (
          target?.closest(
            'textarea, select, input[type="text"], input[type="search"]'
          )
        ) {
          return;
        }

        const key =
          event.key.toLowerCase();

        if (
          key === "z" ||
          key === "x"
        ) {
          stopAllNotes();

          setKeyboardOctaveShift(
            (current) => {
              const direction =
                key === "z"
                  ? -1
                  : 1;

              const candidate =
                current +
                direction;

              const baseNote =
                rootMidiNote +
                candidate *
                  12;

              /*
                We draw 13 keys, so keep the
                full visible octave inside MIDI
                note range 0..127.
              */
              if (
                baseNote < 0 ||
                baseNote + 12 >
                  127
              ) {
                return current;
              }

              return candidate;
            }
          );

          return;
        }

        const mapping =
          KEYBOARD_NOTES.find(
            (item) =>
              item.key === key
          );

        if (!mapping) {
          return;
        }

        const note =
          rootMidiNote +
          keyboardOctaveShift *
            12 +
          mapping.offset;

        pressedComputerNotesRef.current
          .set(
            key,
            note
          );

        void noteOn(
          note
        );
      };

    const handleKeyUp =
      (event: KeyboardEvent) => {
        const key =
          event.key.toLowerCase();

        const note =
          pressedComputerNotesRef.current
            .get(
              key
            );

        if (
          note === undefined
        ) {
          return;
        }

        noteOff(
          note
        );

        pressedComputerNotesRef.current
          .delete(
            key
          );
      };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    window.addEventListener(
      "keyup",
      handleKeyUp
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );

      window.removeEventListener(
        "keyup",
        handleKeyUp
      );
    };
  }, [
    rootMidiNote,
    keyboardOctaveShift,
    sound.sourceId,
  ]);

  const handleMidiMessage =
    (event: MIDIMessageEvent) => {
      const data =
        event.data;

      if (
        !data ||
        data.length < 3
      ) {
        return;
      }

      const status =
        data[0];

      const note =
        data[1];

      const velocity =
        data[2];

      const command =
        status & 0xf0;

      const isNoteOn =
        command === 0x90 &&
        velocity > 0;

      const isNoteOff =
        command === 0x80 ||
        (
          command === 0x90 &&
          velocity === 0
        );

      if (isNoteOn) {
        void noteOn(
          note,
          velocity
        );
      }

      if (isNoteOff) {
        noteOff(
          note
        );
      }
    };

  const connectMidiInputs =
    (access: MIDIAccess) => {
      const inputs =
        Array.from(
          access.inputs.values()
        );

      for (
        const input of inputs
      ) {
        input.onmidimessage =
          handleMidiMessage;
      }

      const connected =
        inputs.filter(
          (input) =>
            input.state !==
            "disconnected"
        );

      if (
        connected.length === 0
      ) {
        setMidiStatus(
          "MIDI enabled · no input device found"
        );

        return;
      }

      setMidiStatus(
        `Connected: ${connected
          .map(
            (input) =>
              input.name ||
              "MIDI device"
          )
          .join(", ")}`
      );
    };

  const enableMidi =
    async () => {
      if (
        !navigator.requestMIDIAccess
      ) {
        setMidiStatus(
          "Web MIDI is not available in this browser"
        );

        return;
      }

      try {
        setMidiStatus(
          "Requesting MIDI access..."
        );

        const context =
          getAudioContext();

        if (
          context.state ===
          "suspended"
        ) {
          await context.resume();
        }

        await getDecodedBuffer();

        const access =
          await navigator
            .requestMIDIAccess();

        midiAccessRef.current =
          access;

        connectMidiInputs(
          access
        );

        access.onstatechange =
          () => {
            connectMidiInputs(
              access
            );
          };

        setMidiEnabled(true);
      } catch (error) {
        console.error(
          "Failed to enable Melodic Sampler MIDI:",
          error
        );

        setMidiStatus(
          "MIDI permission was not granted"
        );
      }
    };

  /*
    The UI keyboard spans one octave above
    the root, matching the computer keys.
  */
  const visibleNotes =
    useMemo(
      () =>
        Array.from(
          {
            length: 13,
          },
          (
            _,
            index
          ) =>
            rootMidiNote +
            keyboardOctaveShift *
              12 +
            index
        ),
      [
        rootMidiNote,
        keyboardOctaveShift,
      ]
    );

  useEffect(() => {
    return () => {
      const access =
        midiAccessRef.current;

      if (access) {
        for (
          const input of
          access.inputs.values()
        ) {
          input.onmidimessage =
            null;
        }

        access.onstatechange =
          null;
      }

      stopAllNotes(
        true
      );

      audioContextRef.current
        ?.close()
        .catch(() => {});
    };
  }, []);

  /*
    ADSR visualization.

    Sustain has no fixed duration while a note
    is held, so give it a small representative
    hold section while A / D / R widths reflect
    their actual relative times.
  */
  const envelopeShape =
    useMemo(() => {
      const sustainHoldMs =
        450;

      const a =
        Math.max(
          1,
          attackMs
        );

      const d =
        Math.max(
          1,
          decayMs
        );

      const r =
        Math.max(
          1,
          releaseMs
        );

      const total =
        a +
        d +
        sustainHoldMs +
        r;

      const attackX =
        (
          a /
          total
        ) *
        100;

      const decayX =
        (
          (
            a +
            d
          ) /
          total
        ) *
        100;

      const sustainX =
        (
          (
            a +
            d +
            sustainHoldMs
          ) /
          total
        ) *
        100;

      const sustainY =
        46 -
        (
          Math.max(
            0,
            Math.min(
              100,
              sustainPercent
            )
          ) /
          100
        ) *
          40;

      return {
        attackX,
        decayX,
        sustainX,
        sustainY,

        points:
          `0,46 ${attackX},6 ${decayX},${sustainY} ${sustainX},${sustainY} 100,46`,
      };
    }, [
      attackMs,
      decayMs,
      sustainPercent,
      releaseMs,
    ]);

  return (
    <main className="melodic-shell">
      <header className="melodic-header">
        <div className="workspace-nav">
          <button
            onClick={
              onBack
            }
          >
            ← Library
          </button>

          {onOpenLab && (
            <button
              type="button"
              onClick={() => {
                stopAllNotes(
                  true
                );

                onOpenLab();
              }}
            >
              ← Lab
            </button>
          )}
        </div>

        <div className="melodic-title">
          <h1>
            Melodic Sampler
          </h1>

          <span>
            {sound.fileName}
          </span>
        </div>

        <div className="melodic-midi">
          <button
            className={
              midiEnabled
                ? "midi-button active"
                : "midi-button"
            }
            onClick={() => {
              void enableMidi();
            }}
          >
            {midiEnabled
              ? "MIDI Enabled"
              : "Enable MIDI"}
          </button>

          <span>
            {midiStatus}
          </span>
        </div>
      </header>

      <section className="melodic-preset-bar">
        <select
          value={
            currentPresetId ??
            ""
          }
          disabled={
            presetBusy
          }
          onChange={(event) => {
            const id =
              event.target.value;

            if (id) {
              void loadPreset(
                id
              );
            }
          }}
        >
          <option value="">
            Presets…
          </option>

          {melodicPresets.map(
            (preset) => (
              <option
                key={
                  preset.id
                }
                value={
                  preset.id
                }
              >
                {preset.name}
              </option>
            )
          )}
        </select>

        <input
          type="text"
          value={
            presetName
          }
          disabled={
            presetBusy
          }
          placeholder="Preset name"
          onChange={(event) => {
            setPresetName(
              event.target.value
            );
          }}
        />

        <button
          type="button"
          disabled={
            presetBusy
          }
          onClick={() => {
            void savePreset(
              false
            );
          }}
        >
          {presetBusy
            ? "Working…"
            : currentPresetId
              ? "Update Preset"
              : "Save Preset"}
        </button>

        {currentPresetId && (
          <button
            type="button"
            disabled={
              presetBusy
            }
            onClick={() => {
              void savePreset(
                true
              );
            }}
          >
            Save As New
          </button>
        )}

        {currentPresetId && (
          <button
            type="button"
            disabled={
              presetBusy
            }
            onClick={() => {
              void deleteCurrentPreset();
            }}
          >
            Delete
          </button>
        )}

        {presetStatus && (
          <span className="melodic-preset-status">
            {presetStatus}
          </span>
        )}
      </section>

      <section className="melodic-controls">
        <label className="melodic-control">
          <span>
            Original pitch key
          </span>

          <select
            value={
              rootMidiNote
            }
            onChange={(event) => {
              stopAllNotes();

              const next =
                Number(
                  event.target.value
                );

              rootMidiNoteRef.current =
                next;

              setRootMidiNote(
                next
              );

              /*
                Reset the computer keyboard to
                the new root octave.
              */
              setKeyboardOctaveShift(
                0
              );
            }}
          >
            {ROOT_OPTIONS.map(
              (option) => (
                <option
                  key={
                    option.midi
                  }
                  value={
                    option.midi
                  }
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </label>

        <div className="melodic-control melodic-octave-control">
          <span>
            Computer octave
          </span>

          <div className="melodic-stepper">
            <button
              type="button"
              title="Octave down (Z)"
              onClick={() => {
                stopAllNotes();

                setKeyboardOctaveShift(
                  (current) => {
                    const candidate =
                      current - 1;

                    const baseNote =
                      rootMidiNote +
                      candidate *
                        12;

                    return baseNote >=
                      0
                      ? candidate
                      : current;
                  }
                );
              }}
            >
              Z −
            </button>

            <strong>
              {keyboardOctaveShift >
              0
                ? `+${keyboardOctaveShift}`
                : keyboardOctaveShift}
              {" oct"}
            </strong>

            <button
              type="button"
              title="Octave up (X)"
              onClick={() => {
                stopAllNotes();

                setKeyboardOctaveShift(
                  (current) => {
                    const candidate =
                      current + 1;

                    const baseNote =
                      rootMidiNote +
                      candidate *
                        12;

                    return baseNote +
                      12 <=
                      127
                      ? candidate
                      : current;
                  }
                );
              }}
            >
              X +
            </button>
          </div>
        </div>

        <label className="melodic-control">
          <span>
            Transpose
          </span>

          <div className="melodic-number-control">
            <input
              type="number"
              min="-48"
              max="48"
              step="1"
              value={
                transposeSemitones
              }
              onChange={(event) => {
                const next =
                  Math.max(
                    -48,
                    Math.min(
                      48,
                      Math.round(
                        Number(
                          event.target.value
                        ) || 0
                      )
                    )
                  );

                stopAllNotes();

                transposeRef.current =
                  next;

                setTransposeSemitones(
                  next
                );
              }}
            />

            <span>
              st
            </span>
          </div>
        </label>

        <label className="melodic-control melodic-fine-control">
          <span>
            Fine tune
          </span>

          <input
            type="range"
            min="-100"
            max="100"
            step="1"
            value={
              fineTuneCents
            }
            onChange={(event) => {
              const next =
                Math.max(
                  -100,
                  Math.min(
                    100,
                    Number(
                      event.target.value
                    ) || 0
                  )
                );

              stopAllNotes();

              fineTuneRef.current =
                next;

              setFineTuneCents(
                next
              );
            }}
          />

          <div className="melodic-number-control">
            <input
              type="number"
              min="-100"
              max="100"
              step="1"
              value={
                fineTuneCents
              }
              onChange={(event) => {
                const next =
                  Math.max(
                    -100,
                    Math.min(
                      100,
                      Number(
                        event.target.value
                      ) || 0
                    )
                  );

                stopAllNotes();

                fineTuneRef.current =
                  next;

                setFineTuneCents(
                  next
                );
              }}
            />

            <span>
              ¢
            </span>
          </div>
        </label>

        <button
          type="button"
          className="melodic-reset-tuning"
          onClick={() => {
            stopAllNotes();

            transposeRef.current =
              0;

            fineTuneRef.current =
              0;

            setTransposeSemitones(
              0
            );

            setFineTuneCents(
              0
            );

            setKeyboardOctaveShift(
              0
            );
          }}
        >
          Reset Tuning
        </button>

        <button
          type="button"
          className={
            showInstrumentMenu
              ? "melodic-instrument-menu-button active"
              : "melodic-instrument-menu-button"
          }
          aria-expanded={
            showInstrumentMenu
          }
          onClick={() => {
            setShowInstrumentMenu(
              (current) =>
                !current
            );
          }}
        >
          Instrument
          <span>
            {showInstrumentMenu
              ? "▴"
              : "▾"}
          </span>
        </button>

        <div className="melodic-ready">
          {isReady
            ? "● Ready"
            : "Preparing audio..."}
        </div>
      </section>

      {showInstrumentMenu && (
        <section className="melodic-instrument-menu">
          <div className="melodic-menu-topline">
            <div className="melodic-menu-summary">
              <strong>
                Instrument
              </strong>

              <span>
                {voiceMode ===
                "mono"
                  ? `Mono · ${glideMs} ms glide`
                  : "Poly"}
                {" · "}
                {loopWhileHeld
                  ? "Loop while held"
                  : "One shot"}
              </span>
            </div>

            <div className="melodic-menu-actions">
              <button
                type="button"
                className={
                  loopWhileHeld
                    ? "melodic-loop-toggle active"
                    : "melodic-loop-toggle"
                }
                onClick={() => {
                  const next =
                    !loopWhileHeld;

                  loopWhileHeldRef.current =
                    next;

                  setLoopWhileHeld(
                    next
                  );
                }}
              >
                {loopWhileHeld
                  ? "Loop"
                  : "One Shot"}
              </button>

              <button
                type="button"
                className={
                  loopAutoSmooth
                    ? "melodic-loop-toggle active"
                    : "melodic-loop-toggle"
                }
                disabled={
                  !loopWhileHeld
                }
                onClick={() => {
                  const next =
                    !loopAutoSmooth;

                  loopAutoSmoothRef.current =
                    next;

                  preparedLoopCacheRef.current =
                    null;

                  setLoopAutoSmooth(
                    next
                  );
                }}
                title="Automatically move loop boundaries to nearby quiet points"
              >
                Smooth
              </button>

              <div className="melodic-mode-toggle">
                <button
                  type="button"
                  className={
                    voiceMode ===
                      "mono"
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    stopAllNotes(
                      true
                    );

                    voiceModeRef.current =
                      "mono";

                    setVoiceMode(
                      "mono"
                    );
                  }}
                >
                  Mono
                </button>

                <button
                  type="button"
                  className={
                    voiceMode ===
                      "poly"
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    stopAllNotes(
                      true
                    );

                    voiceModeRef.current =
                      "poly";

                    setVoiceMode(
                      "poly"
                    );
                  }}
                >
                  Poly
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopAllNotes(
                    true
                  );

                  voiceModeRef.current =
                    "mono";

                  loopWhileHeldRef.current =
                    true;

                  loopAutoSmoothRef.current =
                    true;

                  loopCrossfadeMsRef.current =
                    sound.loopCrossfadeMs ??
                    8;

                  preparedLoopCacheRef.current =
                    null;

                  glideMsRef.current =
                    80;

                  attackMsRef.current =
                    0;

                  decayMsRef.current =
                    180;

                  sustainPercentRef.current =
                    100;

                  releaseMsRef.current =
                    120;

                  gainDbRef.current =
                    0;

                  setVoiceMode(
                    "mono"
                  );

                  setLoopWhileHeld(
                    true
                  );

                  setLoopAutoSmooth(
                    true
                  );

                  setLoopCrossfadeMs(
                    sound.loopCrossfadeMs ??
                    8
                  );

                  setGlideMs(
                    80
                  );

                  setAttackMs(
                    0
                  );

                  setDecayMs(
                    180
                  );

                  setSustainPercent(
                    100
                  );

                  setReleaseMs(
                    120
                  );

                  setGainDb(
                    0
                  );
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="melodic-compact-body">
            <div className="melodic-compact-envelope">
              <div className="melodic-envelope-header">
                <div>
                  <strong>
                    Amp Envelope
                  </strong>

                  <span>
                    ADSR
                  </span>
                </div>

                <div className="melodic-envelope-values">
                  <span>
                    A {attackMs}
                  </span>

                  <span>
                    D {decayMs}
                  </span>

                  <span>
                    S {sustainPercent}%
                  </span>

                  <span>
                    R {releaseMs}
                  </span>
                </div>
              </div>

              <div className="melodic-envelope-visual compact">
                <svg
                  viewBox="0 0 100 52"
                  preserveAspectRatio="none"
                  aria-label="ADSR envelope shape"
                >
                  <line
                    className="envelope-axis"
                    x1="0"
                    y1="46"
                    x2="100"
                    y2="46"
                  />

                  <line
                    className="envelope-sustain-guide"
                    x1={
                      envelopeShape.decayX
                    }
                    y1={
                      envelopeShape.sustainY
                    }
                    x2={
                      envelopeShape.sustainX
                    }
                    y2={
                      envelopeShape.sustainY
                    }
                  />

                  <polyline
                    className="envelope-shape"
                    points={
                      envelopeShape.points
                    }
                    fill="none"
                  />
                </svg>
              </div>
            </div>

            <div className="melodic-knob-bank compact">
              <Knob
                label="Glide"
                value={
                  glideMs
                }
                min={0}
                max={2000}
                step={1}
                unit="ms"
                curve={2.6}
                disabled={
                  voiceMode !==
                    "mono"
                }
                onChange={(next) => {
                  glideMsRef.current =
                    next;

                  setGlideMs(
                    next
                  );
                }}
              />

              <Knob
                label="Attack"
                value={
                  attackMs
                }
                min={0}
                max={5000}
                step={1}
                unit="ms"
                curve={3}
                onChange={(next) => {
                  attackMsRef.current =
                    next;

                  setAttackMs(
                    next
                  );
                }}
              />

              <Knob
                label="Decay"
                value={
                  decayMs
                }
                min={0}
                max={5000}
                step={1}
                unit="ms"
                curve={3}
                onChange={(next) => {
                  decayMsRef.current =
                    next;

                  setDecayMs(
                    next
                  );
                }}
              />

              <Knob
                label="Sustain"
                value={
                  sustainPercent
                }
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={(next) => {
                  sustainPercentRef.current =
                    next;

                  setSustainPercent(
                    next
                  );
                }}
              />

              <Knob
                label="Release"
                value={
                  releaseMs
                }
                min={0}
                max={10000}
                step={1}
                unit="ms"
                curve={3.2}
                onChange={(next) => {
                  releaseMsRef.current =
                    next;

                  setReleaseMs(
                    next
                  );
                }}
              />

              <Knob
                label="Loop XFade"
                value={
                  loopCrossfadeMs
                }
                min={0}
                max={100}
                step={1}
                unit="ms"
                curve={2.4}
                disabled={
                  !loopWhileHeld
                }
                onChange={(next) => {
                  loopCrossfadeMsRef.current =
                    next;

                  preparedLoopCacheRef.current =
                    null;

                  setLoopCrossfadeMs(
                    next
                  );
                }}
              />

              <Knob
                label="Gain"
                value={
                  gainDb
                }
                min={-36}
                max={12}
                step={0.5}
                unit="dB"
                warning={
                  gainDb > 6
                    ? "May clip"
                    : null
                }
                onChange={(next) => {
                  gainDbRef.current =
                    next;

                  setGainDb(
                    next
                  );

                  applyGainToActiveVoices(
                    next
                  );
                }}
              />
            </div>
          </div>
        </section>
      )}

      <section className="melodic-info">
        <strong>
          Chromatic playback
        </strong>

        <span>
          {midiNoteName(
            rootMidiNote
          )} is the source's original
          pitch key. Transpose and Fine
          Tune shift the instrument
          globally.
        </span>

        <span>
          Computer MIDI Keyboard:
          {" "}
          A W S E D F T G Y H U J K
          {" · "}
          Z octave down
          {" · "}
          X octave up
        </span>

        <span>
          {voiceMode ===
          "mono"
            ? `Mono · ${glideMs} ms glide`
            : "Polyphonic playback"}
          {" · "}
          {loopWhileHeld
            ? (
                sound.loopStartSeconds !==
                  undefined &&
                sound.loopEndSeconds !==
                  undefined
                  ? `Loops Lab region · ${loopCrossfadeMs} ms xfade`
                  : `Loops whole clip · ${loopCrossfadeMs} ms xfade`
              )
            : "One shot"}
          {" · "}
          ADSR {attackMs}/{decayMs}/{sustainPercent}%/{releaseMs}
          {" · "}
          Gain {gainDb > 0
            ? `+${gainDb}`
            : gainDb} dB
        </span>

        <span>
          Current computer range:
          {" "}
          {midiNoteName(
            rootMidiNote +
            keyboardOctaveShift *
              12
          )}
          {" – "}
          {midiNoteName(
            rootMidiNote +
            keyboardOctaveShift *
              12 +
            12
          )}
        </span>
      </section>

      <section className="melodic-keyboard">
        {visibleNotes.map(
          (
            note,
            index
          ) => {
            const active =
              activeNotes.has(
                note
              );

            const noteName =
              midiNoteName(
                note
              );

            const keyboardKey =
              KEYBOARD_NOTES[
                index
              ]?.key
                .toUpperCase();

            return (
              <button
                key={note}
                className={[
                  "melodic-key",

                  noteName.includes(
                    "#"
                  )
                    ? "black-note"
                    : "white-note",

                  active
                    ? "active"
                    : "",
                ]
                  .filter(
                    Boolean
                  )
                  .join(" ")}
                onMouseDown={() => {
                  void noteOn(
                    note
                  );
                }}
                onMouseUp={() => {
                  noteOff(
                    note
                  );
                }}
                onMouseLeave={() => {
                  if (
                    activeNotes.has(
                      note
                    )
                  ) {
                    noteOff(
                      note
                    );
                  }
                }}
              >
                <strong>
                  {noteName}
                </strong>

                <span>
                  {keyboardKey}
                </span>
              </button>
            );
          }
        )}
      </section>

      <section className="melodic-details">
        <span>
          {sound.durationSeconds.toFixed(
            2
          )}
          s
        </span>

        {sound.tags.map(
          (tag) => (
            <span
              className="tag-chip"
              key={tag}
            >
              {tag}
            </span>
          )
        )}
      </section>
    </main>
  );
}

export default MelodicSampler;
