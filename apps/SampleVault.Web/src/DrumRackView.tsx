import {
  useEffect,
  useRef,
  useState,
} from "react";

import "./App.css";
import type { DrumRackSound } from "./DrumRackSound";

type DrumRackViewProps = {
  slots: (DrumRackSound | null)[];

  pendingSample:
    | DrumRackSound
    | null;

  onBack: () => void;

  onOpenLab?:
    () => void;

  onOpenSoundInLab: (
    sound: DrumRackSound,
    slotIndex: number
  ) => void;

  onRemove: (
    slotIndex: number
  ) => void;

  onMove: (
    fromIndex: number,
    toIndex: number
  ) => void;

  onReplace: (
    slotIndex: number
  ) => void;

  onCancelReplace: () => void;

  onLoadPreset: (
    slots:
      (DrumRackSound | null)[]
  ) => void;
};

type RackContextMenu = {
  slotIndex: number;
  sample: DrumRackSound | null;
  x: number;
  y: number;
};

type RackPresetSummary = {
  id: number;
  name: string;
  slotCount: number;
  updatedAt: string;
};

type RackPresetResponse = {
  id: number;
  name: string;

  slots: Array<{
    slotIndex: number;
    rackId: string;

    sourceKind:
      | "library"
      | "rackAsset";

    sampleId:
      | number
      | null;

    tempId:
      | string
      | null;

    rackAssetSlotId:
      | number
      | null;

    fileName: string;
    durationSeconds: number;
    tags: string[];
    audioUrl: string;
  }>;
};

const noteNames = [
  "C1",
  "C#1",
  "D1",
  "D#1",

  "E1",
  "F1",
  "F#1",
  "G1",

  "G#1",
  "A1",
  "A#1",
  "B1",

  "C2",
  "C#2",
  "D2",
  "D#2",
];

/*
  Each entry corresponds to the SAME
  slot index as noteNames.

  Because C1 is the bottom-left pad:

  1 2 3 4
  Q W E R
  A S D F
  Z X C V
*/
const keyboardKeys = [
  "z",
  "x",
  "c",
  "v",

  "a",
  "s",
  "d",
  "f",

  "q",
  "w",
  "e",
  "r",

  "1",
  "2",
  "3",
  "4",
];

/*
  Our array still stores notes from
  LOW → HIGH:

  slot 0  = C1
  slot 15 = D#2

  But CSS grid normally draws index 0
  in the TOP LEFT.

  This display order flips the rows so
  low notes appear at the bottom.
*/
const displayOrder = [
  12,
  13,
  14,
  15,

  8,
  9,
  10,
  11,

  4,
  5,
  6,
  7,

  0,
  1,
  2,
  3,
];

const DEFAULT_MIDI_NOTES =
  Array.from(
    { length: 16 },
    (_, index) =>
      36 + index
  );

const MIDI_MAP_STORAGE_KEY =
  "samplevault-drum-midi-map";

function loadSavedMidiMap() {
  try {
    const raw =
      localStorage.getItem(
        MIDI_MAP_STORAGE_KEY
      );

    if (!raw) {
      return DEFAULT_MIDI_NOTES;
    }

    const parsed =
      JSON.parse(raw);

    if (
      !Array.isArray(parsed) ||
      parsed.length !== 16 ||
      parsed.some(
        (note) =>
          typeof note !==
            "number" ||
          note < 0 ||
          note > 127
      )
    ) {
      return DEFAULT_MIDI_NOTES;
    }

    return parsed as number[];
  } catch {
    return DEFAULT_MIDI_NOTES;
  }
}

function DrumRackView({
  slots,
  pendingSample,
  onBack,
  onOpenLab,
  onOpenSoundInLab,
  onRemove,
  onMove,
  onReplace,
  onCancelReplace,
  onLoadPreset,
}: DrumRackViewProps) {
  const [
    draggedSlotIndex,
    setDraggedSlotIndex,
  ] = useState<number | null>(
    null
  );

  const [
    dragOverSlotIndex,
    setDragOverSlotIndex,
  ] = useState<number | null>(
    null
  );

  const [
    activeSlots,
    setActiveSlots,
  ] = useState<Set<number>>(
    () => new Set()
  );

  const [
    contextMenu,
    setContextMenu,
  ] = useState<RackContextMenu | null>(
    null
  );

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

  /*
    Which SampleVault rack slot is
    currently waiting for the next
    physical MIDI note?
  */
  const [
    presetName,
    setPresetName,
  ] = useState("");

  const [
    savedPresets,
    setSavedPresets,
  ] = useState<
    RackPresetSummary[]
  >([]);

  const [
    selectedPresetId,
    setSelectedPresetId,
  ] = useState<number | null>(
    null
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
    learningSlotIndex,
    setLearningSlotIndex,
  ] = useState<number | null>(
    null
  );

  /*
    Index = rack slot
    Value = physical MIDI note

    Example:

    slotMidiNotes[0] = 48

    means MIDI note 48 triggers C1.
  */
  const [
    slotMidiNotes,
    setSlotMidiNotes,
  ] = useState<number[]>(
    () => loadSavedMidiMap()
  );

  const midiAccessRef =
    useRef<MIDIAccess | null>(
      null
    );

  /*
    Web Audio is used instead of creating a
    new HTMLAudioElement for every drum hit.

    Pre-decoded AudioBuffers remove most of
    the small live MIDI delay caused by the
    media-element/network playback path.
  */
  const audioContextRef =
    useRef<AudioContext | null>(
      null
    );

  const audioBuffersRef =
    useRef<
      Map<string, AudioBuffer>
    >(
      new Map()
    );

  const loadingBuffersRef =
    useRef<
      Map<string, Promise<AudioBuffer>>
    >(
      new Map()
    );

  const slotsRef =
    useRef(slots);

  const midiNotesRef =
    useRef(slotMidiNotes);

  const learningSlotRef =
    useRef<number | null>(
      null
    );

  useEffect(() => {
    midiNotesRef.current =
      slotMidiNotes;
  }, [slotMidiNotes]);

  useEffect(() => {
    learningSlotRef.current =
      learningSlotIndex;
  }, [learningSlotIndex]);

  const activateSlot = (
    slotIndex: number
  ) => {
    setActiveSlots(
      (current) => {
        const updated =
          new Set(current);

        updated.add(
          slotIndex
        );

        return updated;
      }
    );
  };

  const deactivateSlot = (
    slotIndex: number
  ) => {
    setActiveSlots(
      (current) => {
        const updated =
          new Set(current);

        updated.delete(
          slotIndex
        );

        return updated;
      }
    );
  };

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

  const loadAudioBuffer =
    async (
      sample: DrumRackSound
    ): Promise<AudioBuffer> => {
      const cached =
        audioBuffersRef.current.get(
          sample.rackId
        );

      if (cached) {
        return cached;
      }

      const alreadyLoading =
        loadingBuffersRef.current.get(
          sample.rackId
        );

      if (alreadyLoading) {
        return alreadyLoading;
      }

      const loading =
        (async () => {
          const response =
            await fetch(
              sample.audioUrl
            );

          if (!response.ok) {
            throw new Error(
              `Failed to load ${sample.fileName}`
            );
          }

          const rawAudio =
            await response.arrayBuffer();

          const context =
            getAudioContext();

          const buffer =
            await context.decodeAudioData(
              rawAudio
            );

          audioBuffersRef.current.set(
            sample.rackId,
            buffer
          );

          loadingBuffersRef.current.delete(
            sample.rackId
          );

          return buffer;
        })();

      loadingBuffersRef.current.set(
        sample.rackId,
        loading
      );

      return loading;
    };

  const preloadRackAudio =
    async () => {
      const loadedSounds =
        slotsRef.current.filter(
          (
            sample
          ): sample is DrumRackSound =>
            sample !== null
        );

      await Promise.all(
        loadedSounds.map(
          (sample) =>
            loadAudioBuffer(
              sample
            ).catch((error) => {
              console.error(
                "Failed to preload drum sound:",
                error
              );

              return null;
            })
        )
      );
    };

  const startBuffer = (
    buffer: AudioBuffer,
    velocity = 127
  ) => {
    const context =
      getAudioContext();

    const source =
      context.createBufferSource();

    const gain =
      context.createGain();

    source.buffer =
      buffer;

    gain.gain.value =
      Math.max(
        0.02,
        Math.min(
          1,
          velocity / 127
        )
      );

    source.connect(gain);
    gain.connect(
      context.destination
    );

    /*
      Web Audio schedules against the audio
      clock instead of waiting for an
      HTMLAudioElement to begin playback.
    */
    source.start();
  };

  const playSample = (
    sample: DrumRackSound,
    velocity = 127
  ) => {
    const context =
      getAudioContext();

    if (
      context.state ===
      "suspended"
    ) {
      context.resume().catch(
        () => {}
      );
    }

    const cached =
      audioBuffersRef.current.get(
        sample.rackId
      );

    if (cached) {
      startBuffer(
        cached,
        velocity
      );

      return;
    }

    /*
      This should mainly happen on the first
      hit immediately after loading a new sound.
      The preload effect below makes later hits
      use the fast cached path.
    */
    loadAudioBuffer(sample)
      .then((buffer) => {
        startBuffer(
          buffer,
          velocity
        );
      })
      .catch((error) => {
        console.error(
          "Drum pad playback failed:",
          error
        );
      });
  };

  /*
    Whenever rack contents change, decode the
    new audio ahead of time.
  */
  useEffect(() => {
    slotsRef.current =
      slots;

    void preloadRackAudio();
  }, [slots]);

  /*
    COMPUTER KEYBOARD PLAYBACK
  */
  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.repeat) {
        return;
      }

      const target =
        event.target as
          HTMLElement | null;

      /*
        Don't steal keys while someone
        is typing into a control.
      */
      if (
        target?.closest(
          "input, textarea, select"
        )
      ) {
        return;
      }

      const key =
        event.key.toLowerCase();

      const slotIndex =
        keyboardKeys.indexOf(
          key
        );

      if (
        slotIndex === -1
      ) {
        return;
      }

      const sample =
        slots[slotIndex];

      if (!sample) {
        return;
      }

      activateSlot(
        slotIndex
      );

      playSample(
        sample
      );
    };

    const handleKeyUp = (
      event: KeyboardEvent
    ) => {
      const key =
        event.key.toLowerCase();

      const slotIndex =
        keyboardKeys.indexOf(
          key
        );

      if (
        slotIndex === -1
      ) {
        return;
      }

      deactivateSlot(
        slotIndex
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
  }, [slots]);

  /*
    Assign a newly received MIDI note
    to whichever pad is learning.

    If that MIDI note was already assigned
    to another pad, SWAP the assignments.

    That keeps one MIDI note from controlling
    two different pads accidentally.
  */
  const learnMidiNote = (
    midiNote: number,
    slotIndex: number
  ) => {
    setSlotMidiNotes(
      (current) => {
        const updated =
          [...current];

        const previousNote =
          updated[slotIndex];

        const existingSlot =
          updated.findIndex(
            (
              note,
              index
            ) =>
              note ===
                midiNote &&
              index !==
                slotIndex
          );

        updated[slotIndex] =
          midiNote;

        /*
          MIDI note was already assigned
          elsewhere → swap mappings.
        */
        if (
          existingSlot !== -1
        ) {
          updated[
            existingSlot
          ] = previousNote;
        }

        localStorage.setItem(
          MIDI_MAP_STORAGE_KEY,
          JSON.stringify(
            updated
          )
        );

        return updated;
      }
    );

    setMidiStatus(
      `${noteNames[slotIndex]} learned MIDI note ${midiNote}`
    );

    setLearningSlotIndex(
      null
    );
  };

  const refreshRackPresets =
    async () => {
      try {
        const response =
          await fetch(
            "http://localhost:5085/api/drum-rack-presets"
          );

        if (!response.ok) {
          throw new Error(
            "Failed to load saved Drum Racks."
          );
        }

        const data:
          RackPresetSummary[] =
            await response.json();

        setSavedPresets(
          data
        );
      } catch (error) {
        console.error(
          "Failed to load Drum Rack presets:",
          error
        );
      }
    };

  useEffect(() => {
    void refreshRackPresets();
  }, []);

  const saveRackPreset =
    async () => {
      const name =
        presetName.trim();

      if (!name) {
        setPresetStatus(
          "Give the rack a name first."
        );

        return;
      }

      setPresetBusy(true);
      setPresetStatus(
        "Saving rack..."
      );

      try {
        const rackSlots =
          slots
            .map(
              (
                sound,
                slotIndex
              ) => ({
                sound,
                slotIndex,
              })
            )
            .filter(
              (
                entry
              ): entry is {
                sound:
                  DrumRackSound;
                slotIndex:
                  number;
              } =>
                entry.sound !==
                null
            )
            .map(
              ({
                sound,
                slotIndex,
              }) => ({
                slotIndex,

                sourceKind:
                  sound.sourceKind,

                sampleId:
                  sound.sampleId,

                tempId:
                  sound.tempId,

                rackAssetSlotId:
                  sound
                    .rackAssetSlotId,

                fileName:
                  sound.fileName,

                durationSeconds:
                  sound
                    .durationSeconds,

                tags:
                  sound.tags,
              })
            );

        const response =
          await fetch(
            "http://localhost:5085/api/drum-rack-presets/save",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  name,
                  slots:
                    rackSlots,
                }),
            }
          );

        if (!response.ok) {
          const message =
            await response.text();

          throw new Error(
            message ||
              "Failed to save Drum Rack."
          );
        }

        const result =
          await response.json();

        setSelectedPresetId(
          result.id
        );

        setPresetStatus(
          `Saved "${result.name}"`
        );

        await refreshRackPresets();
      } catch (error) {
        console.error(
          "Failed to save Drum Rack:",
          error
        );

        setPresetStatus(
          error instanceof Error
            ? error.message
            : "Failed to save Drum Rack."
        );
      } finally {
        setPresetBusy(false);
      }
    };

  const loadRackPreset =
    async () => {
      if (
        selectedPresetId ===
        null
      ) {
        setPresetStatus(
          "Choose a saved rack first."
        );

        return;
      }

      setPresetBusy(true);
      setPresetStatus(
        "Loading rack..."
      );

      try {
        const response =
          await fetch(
            `http://localhost:5085/api/drum-rack-presets/${selectedPresetId}`
          );

        if (!response.ok) {
          const message =
            await response.text();

          throw new Error(
            message ||
              "Failed to load Drum Rack."
          );
        }

        const result:
          RackPresetResponse =
            await response.json();

        const loadedSlots:
          (DrumRackSound | null)[] =
            Array(16)
              .fill(null);

        for (
          const slot of
          result.slots
        ) {
          loadedSlots[
            slot.slotIndex
          ] = {
            rackId:
              slot.rackId,

            sourceKind:
              slot.sourceKind,

            sampleId:
              slot.sampleId,

            tempId:
              slot.tempId,

            rackAssetSlotId:
              slot
                .rackAssetSlotId,

            fileName:
              slot.fileName,

            durationSeconds:
              slot
                .durationSeconds,

            tags:
              slot.tags,

            audioUrl:
              slot.audioUrl,
          };
        }

        onLoadPreset(
          loadedSlots
        );

        setPresetName(
          result.name
        );

        setPresetStatus(
          `Loaded "${result.name}"`
        );
      } catch (error) {
        console.error(
          "Failed to load Drum Rack:",
          error
        );

        setPresetStatus(
          error instanceof Error
            ? error.message
            : "Failed to load Drum Rack."
        );
      } finally {
        setPresetBusy(false);
      }
    };

  const deleteRackPreset =
    async () => {
      if (
        selectedPresetId ===
        null
      ) {
        return;
      }

      const selected =
        savedPresets.find(
          (preset) =>
            preset.id ===
            selectedPresetId
        );

      if (!selected) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete saved rack "${selected.name}"?\n\nThis deletes the preset and any private Lab-edit audio stored only for that preset. It does not delete normal Library samples.`
        );

      if (!confirmed) {
        return;
      }

      setPresetBusy(true);

      try {
        const response =
          await fetch(
            `http://localhost:5085/api/drum-rack-presets/${selectedPresetId}`,
            {
              method: "DELETE",
            }
          );

        if (!response.ok) {
          const message =
            await response.text();

          throw new Error(
            message ||
              "Failed to delete saved rack."
          );
        }

        setSelectedPresetId(
          null
        );

        setPresetStatus(
          `Deleted "${selected.name}"`
        );

        await refreshRackPresets();
      } catch (error) {
        console.error(
          "Failed to delete rack preset:",
          error
        );

        setPresetStatus(
          error instanceof Error
            ? error.message
            : "Failed to delete saved rack."
        );
      } finally {
        setPresetBusy(false);
      }
    };

  /*
    MIDI MESSAGE HANDLER
  */
  const handleMidiMessage = (
    event: MIDIMessageEvent
  ) => {
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
        command ===
          0x90 &&
        velocity === 0
      );

    /*
      MIDI LEARN takes priority.

      When learning, the next actual
      Note On is captured instead of
      triggering the rack.
    */
    if (
      isNoteOn &&
      learningSlotRef.current !==
        null
    ) {
      learnMidiNote(
        note,
        learningSlotRef.current
      );

      return;
    }

    /*
      Find which SampleVault rack slot
      owns this physical MIDI note.
    */
    const slotIndex =
      midiNotesRef.current
        .indexOf(note);

    if (
      slotIndex === -1
    ) {
      return;
    }

    if (isNoteOn) {
      activateSlot(
        slotIndex
      );

      const sample =
        slotsRef.current[
          slotIndex
        ];

      if (sample) {
        playSample(
          sample,
          velocity
        );
      }
    }

    if (isNoteOff) {
      deactivateSlot(
        slotIndex
      );
    }
  };

  const connectMidiInputs = (
    access: MIDIAccess
  ) => {
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

  /*
    Return true if MIDI was successfully
    enabled. This lets MIDI Learn request
    permission automatically if necessary.
  */
  const enableMidi =
    async (): Promise<boolean> => {
      if (
        !navigator.requestMIDIAccess
      ) {
        setMidiStatus(
          "Web MIDI is not available in this browser"
        );

        return false;
      }

      try {
        setMidiStatus(
          "Requesting MIDI access..."
        );

        const access =
          await navigator
            .requestMIDIAccess();

        const audioContext =
          getAudioContext();

        if (
          audioContext.state ===
          "suspended"
        ) {
          await audioContext.resume();
        }

        await preloadRackAudio();

        midiAccessRef.current =
          access;

        setMidiEnabled(true);

        connectMidiInputs(
          access
        );

        access.onstatechange =
          () => {
            connectMidiInputs(
              access
            );
          };

        return true;
      } catch (error) {
        console.error(
          "Failed to enable MIDI:",
          error
        );

        setMidiStatus(
          "MIDI permission was not granted"
        );

        return false;
      }
    };

  const beginMidiLearn =
    async (
      slotIndex: number
    ) => {
      /*
        If MIDI isn't active yet,
        clicking Learn MIDI Note can
        request access for us.
      */
      if (!midiEnabled) {
        const enabled =
          await enableMidi();

        if (!enabled) {
          return;
        }
      }

      setLearningSlotIndex(
        slotIndex
      );

      setMidiStatus(
        `MIDI Learn: hit the controller pad/key for ${noteNames[slotIndex]}`
      );

      setContextMenu(
        null
      );
    };

  const resetMidiMapping =
    () => {
      const reset =
        [...DEFAULT_MIDI_NOTES];

      setSlotMidiNotes(
        reset
      );

      midiNotesRef.current =
        reset;

      localStorage.setItem(
        MIDI_MAP_STORAGE_KEY,
        JSON.stringify(
          reset
        )
      );

      setLearningSlotIndex(
        null
      );

      setMidiStatus(
        "MIDI mapping reset to notes 36–51"
      );
    };

  /*
    MIDI CLEANUP
  */
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

      audioContextRef.current
        ?.close()
        .catch(() => {});
    };
  }, []);

  /*
    CUSTOM RIGHT-CLICK MENU
  */
  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeMenu = () => {
      setContextMenu(
        null
      );
    };

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        closeMenu();
      }
    };

    window.addEventListener(
      "click",
      closeMenu
    );

    window.addEventListener(
      "scroll",
      closeMenu,
      true
    );

    window.addEventListener(
      "resize",
      closeMenu
    );

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "click",
        closeMenu
      );

      window.removeEventListener(
        "scroll",
        closeMenu,
        true
      );

      window.removeEventListener(
        "resize",
        closeMenu
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [contextMenu]);

  return (
    <main className="rack-shell">
      <header className="rack-header">
        <div className="workspace-nav">
          <button
            onClick={onBack}
          >
            ← Library
          </button>

          {onOpenLab && (
            <button
              type="button"
              onClick={
                onOpenLab
              }
            >
              ← Lab
            </button>
          )}
        </div>

        <div className="rack-title">
          <h1>
            Drum Rack
          </h1>

          <span>
            {
              slots.filter(
                (slot) =>
                  slot !== null
              ).length
            }{" "}
            / {slots.length} pads loaded
          </span>
        </div>

        <div className="midi-controls">
          <div className="midi-control-buttons">
            <button
              className={
                midiEnabled
                  ? "midi-button active"
                  : "midi-button"
              }
              onClick={
                enableMidi
              }
            >
              {midiEnabled
                ? "MIDI Enabled"
                : "Enable MIDI"}
            </button>

            <button
              className="midi-reset-button"
              onClick={
                resetMidiMapping
              }
            >
              Reset MIDI Map
            </button>
          </div>

          <span className="midi-status">
            {midiStatus}
          </span>
        </div>
      </header>

      <section className="rack-preset-bar">
        <div className="rack-preset-save">
          <input
            type="text"
            placeholder="Rack name..."
            value={
              presetName
            }
            onChange={(event) => {
              setPresetName(
                event.target.value
              );
            }}
            onKeyDown={(event) => {
              if (
                event.key ===
                  "Enter" &&
                !presetBusy
              ) {
                void saveRackPreset();
              }
            }}
          />

          <button
            onClick={() => {
              void saveRackPreset();
            }}
            disabled={
              presetBusy
            }
          >
            Save Rack
          </button>
        </div>

        <div className="rack-preset-load">
          <select
            value={
              selectedPresetId ??
              ""
            }
            onChange={(event) => {
              const value =
                event.target.value;

              setSelectedPresetId(
                value
                  ? Number(value)
                  : null
              );

              const preset =
                savedPresets.find(
                  (item) =>
                    item.id ===
                    Number(value)
                );

              if (preset) {
                setPresetName(
                  preset.name
                );
              }
            }}
          >
            <option value="">
              Saved racks...
            </option>

            {savedPresets.map(
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
                  {" · "}
                  {preset.slotCount}
                  /16
                </option>
              )
            )}
          </select>

          <button
            onClick={() => {
              void loadRackPreset();
            }}
            disabled={
              presetBusy ||
              selectedPresetId ===
                null
            }
          >
            Load
          </button>

          <button
            className="rack-preset-delete"
            onClick={() => {
              void deleteRackPreset();
            }}
            disabled={
              presetBusy ||
              selectedPresetId ===
                null
            }
          >
            Delete
          </button>
        </div>

        {presetStatus && (
          <span className="rack-preset-status">
            {presetStatus}
          </span>
        )}
      </section>

      {learningSlotIndex !==
        null && (
        <div className="midi-learn-banner">
          <strong>
            MIDI Learn
          </strong>

          <span>
            Hit the physical MIDI
            pad/key you want to use
            for{" "}
            {
              noteNames[
                learningSlotIndex
              ]
            }
          </span>

          <button
            onClick={() => {
              setLearningSlotIndex(
                null
              );

              setMidiStatus(
                "MIDI Learn cancelled"
              );
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {pendingSample && (
        <div className="rack-replace-banner">
          <div>
            <strong>
              Drum Rack is full
            </strong>

            <span>
              Choose a pad to replace with{" "}
              {pendingSample.fileName}
            </span>
          </div>

          <button
            onClick={
              onCancelReplace
            }
          >
            Cancel
          </button>
        </div>
      )}

      <section className="drum-rack-grid">
        {displayOrder.map(
          (slotIndex) => {
            const sample =
              slots[slotIndex];

            const isDragging =
              draggedSlotIndex ===
              slotIndex;

            const isDragTarget =
              dragOverSlotIndex ===
              slotIndex;

            const isActive =
              activeSlots.has(
                slotIndex
              );

            const isLearning =
              learningSlotIndex ===
              slotIndex;

            return (
              <div
                key={slotIndex}

                className={[
                  "drum-pad",

                  sample
                    ? "loaded"
                    : "",

                  isDragging
                    ? "dragging"
                    : "",

                  isDragTarget
                    ? "drag-target"
                    : "",

                  isActive
                    ? "active"
                    : "",

                  isLearning
                    ? "midi-learning"
                    : "",

                  pendingSample
                    ? "replace-target"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}

                draggable={
                  sample !== null &&
                  pendingSample === null
                }

                onDragStart={(
                  event
                ) => {
                  if (
                    !sample ||
                    pendingSample
                  ) {
                    return;
                  }

                  setDraggedSlotIndex(
                    slotIndex
                  );

                  event.dataTransfer
                    .setData(
                      "text/plain",
                      String(
                        slotIndex
                      )
                    );

                  event.dataTransfer
                    .effectAllowed =
                    "move";
                }}

                onDragOver={(
                  event
                ) => {
                  if (
                    pendingSample ||
                    draggedSlotIndex ===
                    null
                  ) {
                    return;
                  }

                  event.preventDefault();

                  event.dataTransfer
                    .dropEffect =
                    "move";

                  setDragOverSlotIndex(
                    slotIndex
                  );
                }}

                onDragLeave={() => {
                  if (
                    dragOverSlotIndex ===
                    slotIndex
                  ) {
                    setDragOverSlotIndex(
                      null
                    );
                  }
                }}

                onDrop={(event) => {
                  event.preventDefault();

                  if (
                    draggedSlotIndex ===
                    null
                  ) {
                    return;
                  }

                  if (
                    draggedSlotIndex !==
                    slotIndex
                  ) {
                    onMove(
                      draggedSlotIndex,
                      slotIndex
                    );
                  }

                  setDraggedSlotIndex(
                    null
                  );

                  setDragOverSlotIndex(
                    null
                  );
                }}

                onDragEnd={() => {
                  setDraggedSlotIndex(
                    null
                  );

                  setDragOverSlotIndex(
                    null
                  );
                }}

                /*
                  Right-click works even on
                  EMPTY pads now because MIDI
                  Learn is a pad-level setting,
                  not a sample-level setting.
                */
                onContextMenu={(
                  event
                ) => {
                  event.preventDefault();

                  if (pendingSample) {
                    return;
                  }

                  setContextMenu({
                    slotIndex,
                    sample,
                    x:
                      event.clientX,
                    y:
                      event.clientY,
                  });
                }}

                onMouseDown={() => {
                  if (
                    sample &&
                    !pendingSample
                  ) {
                    activateSlot(
                      slotIndex
                    );
                  }
                }}

                onMouseUp={() => {
                  deactivateSlot(
                    slotIndex
                  );
                }}

                onMouseLeave={() => {
                  deactivateSlot(
                    slotIndex
                  );
                }}

                onClick={() => {
                  /*
                    When the rack is full and a new
                    sample is waiting, clicking any
                    pad chooses that replacement.
                  */
                  if (pendingSample) {
                    onReplace(
                      slotIndex
                    );

                    return;
                  }

                  if (
                    draggedSlotIndex !==
                    null
                  ) {
                    return;
                  }

                  if (sample) {
                    playSample(
                      sample
                    );
                  }
                }}
              >
                <div className="drum-pad-top">
                  <span className="drum-pad-note">
                    {
                      noteNames[
                        slotIndex
                      ]
                    }
                  </span>

                  <span className="drum-pad-key">
                    {
                      keyboardKeys[
                        slotIndex
                      ].toUpperCase()
                    }
                  </span>
                </div>

                {sample ? (
                  <>
                    <strong
                      className="drum-pad-name"
                      title={
                        sample.fileName
                      }
                    >
                      {
                        sample.fileName
                      }
                    </strong>

                    <span className="drum-pad-duration">
                      {sample.durationSeconds.toFixed(
                        2
                      )}
                      s
                    </span>

                    {sample.sourceKind ===
                      "temporary" && (
                      <span className="drum-pad-temp-label">
                        Unsaved Lab Edit
                      </span>
                    )}

                    <span className="drum-pad-midi-note">
                      MIDI{" "}
                      {
                        slotMidiNotes[
                          slotIndex
                        ]
                      }
                    </span>

                    <span className="drum-pad-drag-hint">
                      Drag to move
                    </span>
                  </>
                ) : (
                  <>
                    <span className="drum-pad-empty">
                      Empty
                    </span>

                    <span className="drum-pad-midi-note">
                      MIDI{" "}
                      {
                        slotMidiNotes[
                          slotIndex
                        ]
                      }
                    </span>
                  </>
                )}
              </div>
            );
          }
        )}
      </section>

      {contextMenu && (
        <div
          className="sample-context-menu"
          style={{
            left: Math.min(
              contextMenu.x,
              window.innerWidth -
                230
            ),

            top: Math.min(
              contextMenu.y,
              window.innerHeight -
                210
            ),
          }}
          onClick={(
            event
          ) => {
            event.stopPropagation();
          }}
          onContextMenu={(
            event
          ) => {
            event.preventDefault();
          }}
        >
          <div className="context-menu-name">
            {contextMenu.sample
              ? contextMenu
                  .sample
                  .fileName
              : "Empty Pad"}
          </div>

          <div className="context-menu-name">
            {
              noteNames[
                contextMenu
                  .slotIndex
              ]
            }
            {" · Key "}
            {
              keyboardKeys[
                contextMenu
                  .slotIndex
              ].toUpperCase()
            }
            {" · MIDI "}
            {
              slotMidiNotes[
                contextMenu
                  .slotIndex
              ]
            }
          </div>

          <div className="context-menu-separator" />

          <button
            className="context-menu-item"
            onClick={() => {
              beginMidiLearn(
                contextMenu
                  .slotIndex
              );
            }}
          >
            Learn MIDI Note
          </button>

          {contextMenu.sample && (
            <>
              <div className="context-menu-separator" />

              {(
                contextMenu.sample
                  .sourceKind ===
                  "library" ||
                contextMenu.sample
                  .labSourceSampleId
              ) ? (
                <button
                  className="context-menu-item"
                  onClick={() => {
                    onOpenSoundInLab(
                      contextMenu.sample!,
                      contextMenu.slotIndex
                    );

                    setContextMenu(
                      null
                    );
                  }}
                >
                  Open in Lab
                </button>
              ) : (
                <button
                  className="context-menu-item"
                  disabled
                  title="This saved private Rack asset does not have its original Lab edit history."
                >
                  Open in Lab
                </button>
              )}

              <button
                className="context-menu-item"
                onClick={() => {
                  onRemove(
                    contextMenu
                      .slotIndex
                  );

                  setContextMenu(
                    null
                  );
                }}
              >
                Remove from Drum Rack
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}

export default DrumRackView;