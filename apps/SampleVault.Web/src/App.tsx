import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./App.css";

import WaveformPreview from "./WaveformPreview";

import LabView from "./LabView";
import type {
  LabSessionState,
} from "./LabView";

import DrumRackView from "./DrumRackView";
import MelodicSampler from "./MelodicSampler";
import type { MelodicSamplerSound } from "./MelodicSampler";
import type { DrumRackSound } from "./DrumRackSound";

type AudioSample = {
  id: number;
  fileName: string;
  filePath: string;
  relativePath: string;
  extension: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  isFavorite: boolean;
  indexedAt: string;
  tags: string[];
};

type ScanResult = {
  added: number;
  autoTagged: number;
  needsReview: number;
  reviewSampleIds: number[];
};

type AppView =
  | "library"
  | "lab"
  | "drumRack"
  | "melodic";

type SampleContextMenu = {
  sample: AudioSample;
  x: number;
  y: number;
};

const tagPriority = [
  "808",
  "Kick",
  "Snare",
  "Clap",
  "Hi Hat",
  "Open Hat",
  "Percussion",
  "Cymbal",
  "Bass",
  "Vocal",
  "Melodic",
  "FX",
  "Loop",
  "One Shot",
  "Other",
];

function App() {
  const [samples, setSamples] = useState<AudioSample[]>([]);
  const [search, setSearch] = useState("");

  const [selectedSample, setSelectedSample] =
    useState<AudioSample | null>(null);
    
  const [labSample, setLabSample] =
    useState<AudioSample | null>(null);

  const [
    activeView,
    setActiveView,
  ] = useState<AppView>(
    "library"
  );

  const [
    labSession,
    setLabSession,
  ] = useState<
    LabSessionState | null
  >(null);

  const [
    melodicReturnToLab,
    setMelodicReturnToLab,
  ] = useState(false);

  const [
    rackReturnToLab,
    setRackReturnToLab,
  ] = useState(false);

  /*
    If Lab was opened by right-clicking a Drum Rack
    pad, remember that pad. Lab can then either:

      - Update Rack Sound -> replace this exact pad
      - Add as New Sound  -> keep this pad and add a copy
  */
  const [
    editingRackSlotIndex,
    setEditingRackSlotIndex,
  ] = useState<
    number | null
  >(null);

  const [
    melodicSamplerSound,
    setMelodicSamplerSound,
  ] = useState<MelodicSamplerSound | null>(
    null
  );

  const [drumRackSlots, setDrumRackSlots] =
    useState<(DrumRackSound | null)[]>(
      () => Array(16).fill(null)
    );

  const [
    pendingRackSample,
    setPendingRackSample,
  ] = useState<DrumRackSound | null>(null);

  const [contextMenu, setContextMenu] =
    useState<SampleContextMenu | null>(null);

  const [selectedGroup, setSelectedGroup] =
    useState("All");

  const [editingSampleId, setEditingSampleId] =
    useState<number | null>(null);

  const [tagInput, setTagInput] = useState("");


  // Import state
  const [importPath, setImportPath] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] =
    useState<string | null>(null);

  const [importResult, setImportResult] =
    useState<ScanResult | null>(null);

  // These are the samples from the most recent import
  // that still need human review.
  const [reviewSampleIds, setReviewSampleIds] =
    useState<number[]>([]);

  const [reviewMode, setReviewMode] =
    useState(false);

  const audioRef =
    useRef<HTMLAudioElement | null>(null);

  const loadSamples = async () => {
    try {
      const response = await fetch(
        "http://localhost:5085/api/samples"
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load samples."
        );
      }

      const data = await response.json();

      setSamples(data);
    } catch (error) {
      console.error(
        "Failed to load samples:",
        error
      );
    }
  };

  useEffect(() => {
    loadSamples();
  }, []);

  /*
    Close the custom right-click menu when the user
    clicks elsewhere, scrolls, resizes, or presses Escape.
  */
  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeMenu = () => {
      setContextMenu(null);
    };

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
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

  /*
    Only play when the selected sample ID changes.

    Editing tags does not trigger playback.
  */
  useEffect(() => {
    if (!selectedSample || !audioRef.current) {
      return;
    }

    audioRef.current.currentTime = 0;
    audioRef.current.load();

    audioRef.current.play().catch((error) => {
      console.error(
        "Playback failed:",
        error
      );
    });
  }, [selectedSample?.id]);

  const openSampleInLab = (
    sample: AudioSample
  ) => {
    /*
      Opening a different Library sample starts a
      fresh Lab session. Navigating away from and
      back to the SAME Lab uses labSession instead.
    */
    if (
      labSample?.id !==
      sample.id
    ) {
      setLabSession(
        null
      );
    }

    setLabSample(
      sample
    );

    setEditingRackSlotIndex(
      null
    );

    setActiveView(
      "lab"
    );

    setContextMenu(
      null
    );
  };

  const openRackSoundInLab = (
    sound: DrumRackSound,
    slotIndex: number
  ) => {
    /*
      Library Rack sound:
      open the actual Library sample as a normal
      fresh Lab session.
    */
    if (
      sound.sourceKind ===
        "library" &&
      sound.sampleId !==
        null
    ) {
      const sourceSample =
        samples.find(
          (sample) =>
            sample.id ===
            sound.sampleId
        );

      if (!sourceSample) {
        window.alert(
          "That source sample is no longer in the SampleVault Library."
        );

        return;
      }

      setLabSession(
        null
      );

      setLabSample(
        sourceSample
      );

      setRackReturnToLab(
        true
      );

      setEditingRackSlotIndex(
        slotIndex
      );

      setActiveView(
        "lab"
      );

      return;
    }

    /*
      Temporary sound made with:
        Lab -> Add Current Edit to Drum Rack

      Reopen the ORIGINAL source sample and restore
      the exact trim / reverse / loop settings that
      produced this Rack sound.
    */
    if (
      sound.labSourceSampleId &&
      sound.labState
    ) {
      const sourceSample =
        samples.find(
          (sample) =>
            sample.id ===
            sound.labSourceSampleId
        );

      if (!sourceSample) {
        window.alert(
          "The original Library sample for this Lab edit could not be found."
        );

        return;
      }

      setLabSample(
        sourceSample
      );

      setLabSession({
        sampleId:
          sourceSample.id,

        startTime:
          sound.labState
            .startTime,

        endTime:
          sound.labState
            .endTime,

        reverse:
          sound.labState
            .reverse,

        loopEnabled:
          sound.labState
            .loopEnabled,

        loopStartTime:
          sound.labState
            .loopStartTime,

        loopEndTime:
          sound.labState
            .loopEndTime,

        autoSmoothLoop:
          sound.labState
            .autoSmoothLoop,

        loopCrossfadeMs:
          sound.labState
            .loopCrossfadeMs,
      });

      setRackReturnToLab(
        true
      );

      setEditingRackSlotIndex(
        slotIndex
      );

      setActiveView(
        "lab"
      );

      return;
    }

    /*
      rackAsset sounds loaded from a saved Rack do
      not yet persist the original Lab history in
      SQLite, so there is nothing exact to restore.
    */
    window.alert(
      "This saved Rack asset does not have its original Lab edit history yet."
    );
  };

  const openInMelodicSampler = (
    sample: AudioSample
  ) => {
    setMelodicSamplerSound({
      sourceId:
        `library-${sample.id}`,

      sourceKind:
        "library",

      sampleId:
        sample.id,

      tempId:
        null,

      fileName:
        sample.fileName,

      durationSeconds:
        sample.durationSeconds,

      tags:
        sample.tags,

      audioUrl:
        `http://localhost:5085/api/samples/${sample.id}/rack-audio`,
    });

    setMelodicReturnToLab(
      false
    );

    setActiveView(
      "melodic"
    );

    setContextMenu(null);
  };

  const openLabEditInMelodicSampler = (
    sound: MelodicSamplerSound
  ) => {
    /*
      If we're replacing an older temporary
      Melodic render from this Lab session, clean
      that old scratch file first.
    */
    if (
      melodicSamplerSound &&
      melodicSamplerSound.sourceKind ===
        "temporary" &&
      melodicSamplerSound.tempId !==
        sound.tempId
    ) {
      cleanupTemporaryMelodicSound(
        melodicSamplerSound
      );
    }

    setMelodicSamplerSound(
      sound
    );

    setMelodicReturnToLab(
      true
    );

    setActiveView(
      "melodic"
    );
  };

  const cleanupTemporaryMelodicSound = (
    sound:
      | MelodicSamplerSound
      | null
  ) => {
    if (
      !sound ||
      sound.sourceKind !==
        "temporary" ||
      !sound.tempId
    ) {
      return;
    }

    fetch(
      `http://localhost:5085/api/samples/temp/${sound.tempId}`,
      {
        method: "DELETE",
      }
    ).catch((error) => {
      console.error(
        "Failed to delete temporary Melodic Sampler sound:",
        error
      );
    });
  };

  const toRackSound = (
    sample: AudioSample
  ): DrumRackSound => {
    return {
      rackId: `library-${sample.id}`,
      sourceKind: "library",
      sampleId: sample.id,
      tempId: null,
      rackAssetSlotId: null,
      fileName: sample.fileName,
      durationSeconds:
        sample.durationSeconds,
      tags: sample.tags,
      audioUrl:
        `http://localhost:5085/api/samples/${sample.id}/rack-audio`,

      labSourceSampleId:
        null,

      labState:
        null,
    };
  };

  const addRackSound = (
    sound: DrumRackSound
  ) => {
    /*
      Library samples should not be added
      twice. Temporary Lab edits have their
      own unique rackId, so multiple edits
      of the same original are allowed.
    */
    if (
      drumRackSlots.some(
        (slot) =>
          slot?.rackId === sound.rackId
      )
    ) {
      return;
    }

    const firstEmptyIndex =
      drumRackSlots.findIndex(
        (slot) => slot === null
      );

    /*
      If the rack is full, open it and let
      the user choose a pad to replace.
    */
    if (firstEmptyIndex === -1) {
      setPendingRackSample(sound);

      if (
        activeView ===
        "lab"
      ) {
        setRackReturnToLab(
          true
        );
      }

      setActiveView(
        "drumRack"
      );

      return;
    }

    setDrumRackSlots(
      (currentSlots) => {
        const updated =
          [...currentSlots];

        updated[firstEmptyIndex] =
          sound;

        return updated;
      }
    );
  };

  const addSampleToDrumRack = (
    sample: AudioSample
  ) => {
    addRackSound(
      toRackSound(sample)
    );
  };

  const cleanupTemporaryRackSound = (
    sound: DrumRackSound | null
  ) => {
    if (
      !sound ||
      sound.sourceKind !==
        "temporary" ||
      !sound.tempId
    ) {
      return;
    }

    fetch(
      `http://localhost:5085/api/samples/temp/${sound.tempId}`,
      {
        method: "DELETE",
      }
    ).catch((error) => {
      console.error(
        "Failed to delete temporary rack sound:",
        error
      );
    });
  };

  const moveDrumRackSample = (
    fromIndex: number,
    toIndex: number
  ) => {
    setDrumRackSlots(
      (currentSlots) => {
        const updated =
          [...currentSlots];

        [
          updated[fromIndex],
          updated[toIndex],
        ] = [
          updated[toIndex],
          updated[fromIndex],
        ];

        return updated;
      }
    );
  };

  const updateRackSoundFromLab = (
    slotIndex: number,
    replacement: DrumRackSound
  ) => {
    const previous =
      drumRackSlots[
        slotIndex
      ];

    if (!previous) {
      /*
        The pad may have been removed while the Lab
        was open. Don't silently create a different
        pad; let the user use "Add as New Sound"
        instead.
      */
      window.alert(
        "That Drum Rack pad is empty now. Use Add as New Sound instead."
      );

      return;
    }

    /*
      If the pad previously pointed at a temporary
      Lab render, that scratch WAV is no longer
      needed once the replacement exists.
    */
    if (
      previous.rackId !==
      replacement.rackId
    ) {
      cleanupTemporaryRackSound(
        previous
      );
    }

    setDrumRackSlots(
      (currentSlots) => {
        const updated =
          [...currentSlots];

        updated[
          slotIndex
        ] =
          replacement;

        return updated;
      }
    );
  };

  const removeSampleFromDrumRack = (
    slotIndex: number
  ) => {
    cleanupTemporaryRackSound(
      drumRackSlots[slotIndex]
    );

    setDrumRackSlots(
      (currentSlots) => {
        const updated =
          [...currentSlots];

        updated[slotIndex] =
          null;

        return updated;
      }
    );
  };

  const replaceDrumRackSample = (
    slotIndex: number
  ) => {
    if (!pendingRackSample) {
      return;
    }

    const replacement =
      pendingRackSample;

    cleanupTemporaryRackSound(
      drumRackSlots[slotIndex]
    );

    setDrumRackSlots(
      (currentSlots) => {
        const updated =
          [...currentSlots];

        updated[slotIndex] =
          replacement;

        return updated;
      }
    );

    setPendingRackSample(null);
  };

  const loadDrumRackPreset = (
    loadedSlots:
      (DrumRackSound | null)[]
  ) => {
    /*
      Session-only Lab renders that are being
      replaced by the loaded preset can now be
      cleaned up. Saved rackAsset sounds are
      stable and are NOT deleted here.
    */
    for (
      const sound of
      drumRackSlots
    ) {
      cleanupTemporaryRackSound(
        sound
      );
    }

    setPendingRackSample(
      null
    );

    setDrumRackSlots(
      loadedSlots
    );
  };

  const getPrimaryTag = (
    sample: AudioSample
  ) => {
    for (const tag of tagPriority) {
      const hasTag = sample.tags.some(
        (sampleTag) =>
          sampleTag.toLowerCase() ===
          tag.toLowerCase()
      );

      if (hasTag) {
        return tag;
      }
    }

    return "Other";
  };

  /*
    Makes checking whether a sample is part
    of the current review batch fast.
  */
  const reviewIdSet = useMemo(() => {
    return new Set(reviewSampleIds);
  }, [reviewSampleIds]);

  const filteredSamples = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    return samples.filter((sample) => {
      const matchesSearch =
        query === "" ||
        sample.fileName
          .toLowerCase()
          .includes(query) ||
        sample.tags.some((tag) =>
          tag.toLowerCase().includes(query)
        );

      const matchesGroup =
        selectedGroup === "All"
          ? true
          : selectedGroup === "Favorites"
            ? sample.isFavorite
            : getPrimaryTag(sample) === selectedGroup;

      const matchesReview =
        !reviewMode ||
        reviewIdSet.has(sample.id);

      return (
        matchesSearch &&
        matchesGroup &&
        matchesReview
      );
    });
  }, [
    samples,
    search,
    selectedGroup,
    reviewMode,
    reviewIdSet,
  ]);

  const groupedSamples = useMemo(() => {
    const groups = new Map<
      string,
      AudioSample[]
    >();

    for (const sample of filteredSamples) {
      const group = getPrimaryTag(sample);

      if (!groups.has(group)) {
        groups.set(group, []);
      }

      groups.get(group)!.push(sample);
    }

    return tagPriority
      .map((tag) => ({
        name: tag,
        samples: groups.get(tag) ?? [],
      }))
      .filter(
        (group) => group.samples.length > 0
      );
  }, [filteredSamples]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const sample of samples) {
      const group = getPrimaryTag(sample);

      counts.set(
        group,
        (counts.get(group) ?? 0) + 1
      );
    }

    return counts;
  }, [samples]);

  const favoriteCount = useMemo(() => {
    return samples.filter(
      (sample) => sample.isFavorite
    ).length;
  }, [samples]);

  const handlePlayClick = (
    sample: AudioSample
  ) => {
    /*
      Clicking the same sample again restarts it.
    */
    if (
      selectedSample?.id === sample.id &&
      audioRef.current
    ) {
      audioRef.current.currentTime = 0;

      audioRef.current.play().catch((error) => {
        console.error(
          "Playback failed:",
          error
        );
      });

      return;
    }

    setSelectedSample(sample);
  };

  const updateSampleTags = (
    sampleId: number,
    tags: string[]
  ) => {
    setSamples((currentSamples) =>
      currentSamples.map((sample) =>
        sample.id === sampleId
          ? {
              ...sample,
              tags,
            }
          : sample
      )
    );

    setSelectedSample((currentSample) =>
      currentSample?.id === sampleId
        ? {
            ...currentSample,
            tags,
          }
        : currentSample
    );

    /*
      If this sample was waiting for review,
      and it no longer has "Other",
      review is finished for this sample.
    */
    const stillNeedsReview = tags.some(
      (tag) =>
        tag.toLowerCase() === "other"
    );

    if (!stillNeedsReview) {
      setReviewSampleIds((currentIds) =>
        currentIds.filter(
          (id) => id !== sampleId
        )
      );
    }
  };

  const handleAddTag = async (
    sample: AudioSample
  ) => {
    const tagName = tagInput.trim();

    if (!tagName) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:5085/api/samples/${sample.id}/tags`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: tagName,
          }),
        }
      );

      if (!response.ok) {
        console.error(
          "Failed to add tag"
        );
        return;
      }

      const result =
        await response.json();

      updateSampleTags(
        sample.id,
        result.tags
      );

      setTagInput("");
      setEditingSampleId(null);
    } catch (error) {
      console.error(
        "Failed to add tag:",
        error
      );
    }
  };

  const handleRemoveTag = async (
    sample: AudioSample,
    tagName: string
  ) => {
    try {
      const response = await fetch(
        `http://localhost:5085/api/samples/${sample.id}/tags/${encodeURIComponent(tagName)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        console.error(
          "Failed to remove tag"
        );
        return;
      }

      const result =
        await response.json();

      updateSampleTags(
        sample.id,
        result.tags
      );
    } catch (error) {
      console.error(
        "Failed to remove tag:",
        error
      );
    }
  };

  const handleToggleFavorite = async (
    sample: AudioSample
  ) => {
    try {
      const response = await fetch(
        `http://localhost:5085/api/samples/${sample.id}/favorite`,
        {
          method: "PATCH",
        }
      );

      if (!response.ok) {
        console.error(
          "Failed to update favorite"
        );
        return;
      }

      const result = await response.json();

      setSamples((currentSamples) =>
        currentSamples.map((currentSample) =>
          currentSample.id === sample.id
            ? {
                ...currentSample,
                isFavorite: result.isFavorite,
              }
            : currentSample
        )
      );

      setSelectedSample((currentSample) =>
        currentSample?.id === sample.id
          ? {
              ...currentSample,
              isFavorite: result.isFavorite,
            }
          : currentSample
      );
    } catch (error) {
      console.error(
        "Failed to update favorite:",
        error
      );
    }
  };
  const handleRenameSample = async (
    sample: AudioSample
  ) => {
    const extension =
      sample.extension ||
      sample.fileName.match(
        /\.[^/.]+$/
      )?.[0] ||
      "";

    const currentBaseName =
      extension &&
      sample.fileName
        .toLowerCase()
        .endsWith(
          extension.toLowerCase()
        )
        ? sample.fileName.slice(
            0,
            -extension.length
          )
        : sample.fileName;

    const requestedName =
      window.prompt(
        `Rename "${sample.fileName}"\n\nEnter the new name without the file extension:`,
        currentBaseName
      );

    if (requestedName === null) {
      return;
    }

    const name =
      requestedName.trim();

    if (!name) {
      window.alert(
        "The sample name cannot be empty."
      );

      return;
    }

    try {
      const response = await fetch(
        `http://localhost:5085/api/samples/${sample.id}/rename`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            name,
          }),
        }
      );

      if (!response.ok) {
        const message =
          await response.text();

        throw new Error(
          message ||
            "Failed to rename sample."
        );
      }

      const result =
        await response.json();

      const applyRename = (
        currentSample: AudioSample
      ): AudioSample => {
        if (
          currentSample.id !==
          sample.id
        ) {
          return currentSample;
        }

        return {
          ...currentSample,
          fileName:
            result.fileName,
          filePath:
            result.filePath,
          relativePath:
            result.relativePath,
        };
      };

      /*
        Update every frontend place that may
        still be holding this permanent sample.
      */
      setSamples(
        (currentSamples) =>
          currentSamples.map(
            applyRename
          )
      );

      setSelectedSample(
        (currentSample) =>
          currentSample
            ? applyRename(
                currentSample
              )
            : null
      );

      setLabSample(
        (currentSample) =>
          currentSample
            ? applyRename(
                currentSample
              )
            : null
      );

      /*
        Rack audio URLs are ID-based, so only
        the visible filename needs changing.
      */
      setDrumRackSlots(
        (currentSlots) =>
          currentSlots.map(
            (slot) =>
              slot?.sourceKind ===
                "library" &&
              slot.sampleId ===
                sample.id
                ? {
                    ...slot,
                    fileName:
                      result.fileName,
                  }
                : slot
          )
      );

      setPendingRackSample(
        (currentSound) =>
          currentSound
            ?.sourceKind ===
              "library" &&
          currentSound.sampleId ===
            sample.id
            ? {
                ...currentSound,
                fileName:
                  result.fileName,
              }
            : currentSound
      );

      setContextMenu(null);
    } catch (error) {
      console.error(
        "Failed to rename sample:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while renaming the sample.";

      window.alert(message);
    }
  };

  const handleDeleteSample = async (
    sample: AudioSample
  ) => {
    const confirmed =
      window.confirm(
        `Permanently delete "${sample.fileName}"?\n\n` +
        "This will remove it from SampleVault AND delete the actual audio file from your computer.\n\n" +
        `File:\n${sample.filePath}\n\n` +
        "This cannot be undone."
      );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:5085/api/samples/${sample.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const message =
          await response.text();

        throw new Error(
          message ||
            "Failed to remove sample from SampleVault."
        );
      }

      /*
        Remove it from the Library UI immediately.
      */
      setSamples(
        (currentSamples) =>
          currentSamples.filter(
            (currentSample) =>
              currentSample.id !==
              sample.id
          )
      );

      /*
        Stop/clear Library playback if this was
        the currently selected sound.
      */
      setSelectedSample(
        (currentSample) =>
          currentSample?.id ===
          sample.id
            ? null
            : currentSample
      );

      if (audioRef.current) {
        audioRef.current.pause();
      }

      /*
        If this permanent Library sample was also
        sitting in the Drum Rack, remove that rack
        reference so it cannot point at a deleted
        API sample.
      */
      setDrumRackSlots(
        (currentSlots) =>
          currentSlots.map(
            (slot) =>
              slot?.sourceKind ===
                "library" &&
              slot.sampleId ===
                sample.id
                ? null
                : slot
          )
      );

      setReviewSampleIds(
        (currentIds) =>
          currentIds.filter(
            (id) =>
              id !== sample.id
          )
      );

      setContextMenu(null);
    } catch (error) {
      console.error(
        "Failed to remove sample:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while removing the sample.";

      window.alert(message);
    }
  };

  const openTagEditor = (
    sampleId: number
  ) => {
    if (editingSampleId === sampleId) {
      setEditingSampleId(null);
      setTagInput("");
      return;
    }

    setEditingSampleId(sampleId);
    setTagInput("");
  };

  /*
    Import a folder through the backend scanner.
  */
  const handleImport = async () => {
    const folderPath = importPath.trim();

    if (!folderPath) {
      setImportError(
        "Enter a folder path first."
      );
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportResult(null);
    setReviewMode(false);

    try {
      const response = await fetch(
        "http://localhost:5085/api/samples/scan",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            folderPath,
          }),
        }
      );

      if (!response.ok) {
        const message =
          await response.text();

        throw new Error(
          message || "Import failed."
        );
      }

      const result: ScanResult =
        await response.json();

      setImportResult(result);

      setReviewSampleIds(
        result.reviewSampleIds
      );

      /*
        Refresh the library so the newly imported
        samples immediately appear on the board.
      */
      await loadSamples();
    } catch (error) {
      if (error instanceof Error) {
        setImportError(error.message);
      } else {
        setImportError(
          "Something went wrong."
        );
      }
    } finally {
      setIsImporting(false);
    }
  };

  const startReview = () => {
    setReviewMode(true);
    setSelectedGroup("All");
    setSearch("");
  };

  const exitReview = () => {
    setReviewMode(false);
  };

  /*
  The Melodic Sampler is another full-screen
  instrument view, just like the Lab / Drum Rack.
  */
  if (
    activeView ===
      "melodic" &&
    melodicSamplerSound
  ) {
    return (
      <MelodicSampler
        key={
          melodicSamplerSound.sourceId
        }
        sound={
          melodicSamplerSound
        }
        onLoadPreset={(
          loadedSound
        ) => {
          cleanupTemporaryMelodicSound(
            melodicSamplerSound
          );

          setMelodicSamplerSound(
            loadedSound
          );

          setMelodicReturnToLab(
            false
          );
        }}
        onBack={() => {
          cleanupTemporaryMelodicSound(
            melodicSamplerSound
          );

          setMelodicSamplerSound(
            null
          );

          setMelodicReturnToLab(
            false
          );

          setActiveView(
            "library"
          );
        }}
        onOpenLab={
          melodicReturnToLab &&
          labSample
            ? () => {
                setActiveView(
                  "lab"
                );
              }
            : undefined
        }
      />
    );
  }

  /*
  If a sample has been opened in the Lab,
  show the Lab instead of the Library.
  */
  if (
    activeView ===
      "lab" &&
    labSample
  ) {
    return (
      <LabView
        sample={labSample}
        initialSession={
          labSession
        }
        onSessionChange={
          setLabSession
        }
        onRendered={loadSamples}
        onAddToDrumRack={
          addRackSound
        }
        editingRackSlotIndex={
          editingRackSlotIndex
        }
        onUpdateRackSound={
          updateRackSoundFromLab
        }
        onOpenInMelodicSampler={
          openLabEditInMelodicSampler
        }
        onOpenDrumRack={() => {
          setRackReturnToLab(
            true
          );

          setActiveView(
            "drumRack"
          );
        }}
        onBack={() => {
          /*
            Library exit ends this navigation
            chain. The Lab snapshot itself can
            remain in memory until another Lab
            sample is opened.
          */
          setRackReturnToLab(
            false
          );

          setEditingRackSlotIndex(
            null
          );

          setMelodicReturnToLab(
            false
          );

          if (
            melodicSamplerSound
              ?.sourceKind ===
              "temporary"
          ) {
            cleanupTemporaryMelodicSound(
              melodicSamplerSound
            );

            setMelodicSamplerSound(
              null
            );
          }

          setActiveView(
            "library"
          );
        }}
      />
    );
  }

  if (
    activeView ===
    "drumRack"
  ) {
      return (
        <DrumRackView
          slots={drumRackSlots}
          pendingSample={
            pendingRackSample
          }
          onBack={() => {
            setPendingRackSample(
              null
            );

            setRackReturnToLab(
              false
            );

            setActiveView(
              "library"
            );
          }}
          onOpenLab={
            rackReturnToLab &&
            labSample
              ? () => {
                  setPendingRackSample(
                    null
                  );

                  setActiveView(
                    "lab"
                  );
                }
              : undefined
          }
          onOpenSoundInLab={
            openRackSoundInLab
          }
          onRemove={
            removeSampleFromDrumRack
          }
          onMove={
            moveDrumRackSample
          }
          onReplace={
            replaceDrumRackSample
          }
          onCancelReplace={() => {
            setPendingRackSample(null);
          }}
          onLoadPreset={
            loadDrumRackPreset
          }
        />
      );
    }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>SampleVault</h1>

          <p className="sample-count">
            {filteredSamples.length} samples
          </p>
        </div>
        <button
          className="open-rack-button"
          onClick={() => {
            setRackReturnToLab(
              false
            );

            setActiveView(
              "drumRack"
            );
          }}
        >
          Drum Rack
          <span>
            {
              drumRackSlots.filter(
                (slot) => slot !== null
              ).length
            }
          </span>
        </button>
        <input
          className="search-input"
          type="text"
          placeholder="Search samples or tags..."
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
        />
        
      </header>

      {/* IMPORT */}
      <section className="import-panel">
        <div className="import-row">
          <input
            className="import-path-input"
            type="text"
            placeholder="Paste a sample-kit folder path..."
            value={importPath}
            onChange={(event) =>
              setImportPath(
                event.target.value
              )
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !isImporting
              ) {
                handleImport();
              }
            }}
          />

          <button
            className="import-button"
            onClick={handleImport}
            disabled={isImporting}
          >
            {isImporting
              ? "Importing..."
              : "Import Samples"}
          </button>
        </div>

        {importError && (
          <p className="import-error">
            {importError}
          </p>
        )}

        {importResult && (
          <div className="import-result">
            <strong>
              {importResult.added} samples imported
            </strong>

            <span>
              ✓ {importResult.autoTagged} auto-tagged
            </span>

            <span>
              ⚠ {reviewSampleIds.length} need review
            </span>

            {reviewSampleIds.length > 0 && (
              <button
                onClick={startReview}
              >
                Review {reviewSampleIds.length}
              </button>
            )}
          </div>
        )}
      </section>

      {/* REVIEW MODE */}
      {reviewMode && (
        <div className="review-banner">
          <div>
            <strong>
              Reviewing imported samples
            </strong>

            <span>
              {reviewSampleIds.length} remaining
            </span>
          </div>

          <button onClick={exitReview}>
            Back to Library
          </button>
        </div>
      )}

      {/* CATEGORY / GROUP FILTERS */}
      {!reviewMode && (
        <nav className="group-filters">
          <button
            className={
              selectedGroup === "All"
                ? "filter-button active"
                : "filter-button"
            }
            onClick={() =>
              setSelectedGroup("All")
            }
          >
            All
          </button>
          {favoriteCount > 0 && (
            <button
              className={
                selectedGroup === "Favorites"
                  ? "filter-button active"
                  : "filter-button"
              }
              onClick={() =>
                setSelectedGroup("Favorites")
              }
            >
              ★ Favorites

              <span className="filter-count">
                {favoriteCount}
              </span>
            </button>
            )}

          {tagPriority.map((tag) => {
            const count =
              groupCounts.get(tag) ?? 0;

            if (count === 0) {
              return null;
            }

            return (
              <button
                key={tag}
                className={
                  selectedGroup === tag
                    ? "filter-button active"
                    : "filter-button"
                }
                onClick={() =>
                  setSelectedGroup(tag)
                }
              >
                {tag}

                <span className="filter-count">
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* ONE INVISIBLE PLAYBACK ENGINE */}
      <audio
        ref={audioRef}
        preload="auto"
        src={
          selectedSample
            ? `http://localhost:5085/api/samples/${selectedSample.id}/audio`
            : undefined
        }
      />

      <div className="sample-groups">
        {groupedSamples.map((group) => (
          <section
            className="sample-group"
            key={group.name}
          >
            <div className="group-heading">
              <h2>{group.name}</h2>

              <span>
                {group.samples.length}
              </span>
            </div>

            <div className="soundboard-grid">
              {group.samples.map((sample) => (
                <article
                  className={
                    selectedSample?.id === sample.id
                      ? "sample-pad playing"
                      : "sample-pad"
                  }
                  key={sample.id}
                  onClick={(event) => {
                    const target =
                      event.target as HTMLElement;

                    /*
                      If the click came from an interactive
                      control, let that control handle it
                      instead of playing the sample.
                    */
                    if (
                      target.closest(
                        "button, input, textarea, select"
                      )
                    ) {
                      return;
                    }

                    handlePlayClick(sample);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();

                    setContextMenu({
                      sample,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  title="Click to play · Right-click for options"
                >
                  <div className="pad-header">
                    <button
                      className="play-button"
                      onClick={() =>
                        handlePlayClick(sample)
                      }
                      aria-label={`Play ${sample.fileName}`}
                    >
                      ▶
                    </button>

                    <div className="pad-header-right">
                      <span className="duration">
                        {sample.durationSeconds.toFixed(2)}s
                      </span>

                      <button
                        className={
                          sample.isFavorite
                            ? "favorite-button favorite"
                            : "favorite-button"
                        }
                        onClick={() =>
                          handleToggleFavorite(sample)
                        }
                        aria-label={
                          sample.isFavorite
                            ? `Remove ${sample.fileName} from favorites`
                            : `Add ${sample.fileName} to favorites`
                        }
                        title={
                          sample.isFavorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                      >
                        {sample.isFavorite ? "★" : "☆"}
                      </button>
                    </div>
                  </div>

                  <div
                    className="sample-name"
                    title={sample.fileName}
                  >
                    {sample.fileName}
                  </div>

                  <WaveformPreview
                    sampleId={sample.id}
                    isActive={
                      selectedSample?.id === sample.id
                    }
                    audioRef={audioRef}
                  />

                  <div className="tag-area">
                    {sample.tags.map((tag) => (
                      <button
                        key={tag}
                        className="tag-chip"
                        title={`Remove ${tag}`}
                        onClick={() =>
                          handleRemoveTag(
                            sample,
                            tag
                          )
                        }
                      >
                        {tag}

                        <span className="remove-tag">
                          ×
                        </span>
                      </button>
                    ))}

                    {editingSampleId ===
                    sample.id ? (
                      <div className="tag-input-pill">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Tag..."
                          value={tagInput}
                          onChange={(event) =>
                            setTagInput(
                              event.target.value
                            )
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key ===
                              "Enter"
                            ) {
                              handleAddTag(
                                sample
                              );
                            }

                            if (
                              event.key ===
                              "Escape"
                            ) {
                              setEditingSampleId(
                                null
                              );

                              setTagInput("");
                            }
                          }}
                        />

                        <button
                          className="confirm-tag-button"
                          onClick={() =>
                            handleAddTag(sample)
                          }
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <button
                        className="add-tag-circle"
                        onClick={() =>
                          openTagEditor(
                            sample.id
                          )
                        }
                        aria-label={`Add tag to ${sample.fileName}`}
                      >
                        +
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {filteredSamples.length === 0 && (
        <div className="empty-state">
          {reviewMode
            ? "Nothing left to review."
            : "No samples matched your search."}
        </div>
      )}

      {/* CUSTOM SAMPLE RIGHT-CLICK MENU */}
      {contextMenu && (
        <div
          className="sample-context-menu"
          style={{
            left: Math.min(
              contextMenu.x,
              window.innerWidth - 230
            ),
            top: Math.min(
              contextMenu.y,
              window.innerHeight - 240
            ),
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
        >
          <div className="context-menu-name">
            {contextMenu.sample.fileName}
          </div>

          <button
            className="context-menu-item"
            onClick={() => {
              openSampleInLab(
                contextMenu.sample
              );
            }}
          >
            Open in Lab
          </button>

          <div className="context-menu-separator" />

          <button
            className="context-menu-item"
            onClick={() => {
              addSampleToDrumRack(
                contextMenu.sample
              );

              setContextMenu(null);
            }}
          >
            Add to Drum Rack
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              openInMelodicSampler(
                contextMenu.sample
              );
            }}
          >
            Load as Melodic Sampler
          </button>

          <div className="context-menu-separator" />

          <button
            className="context-menu-item"
            onClick={() => {
              void handleRenameSample(
                contextMenu.sample
              );
            }}
          >
            Rename…
          </button>

          <div className="context-menu-separator" />

          <button
            className="context-menu-item"
            onClick={() => {
              handleToggleFavorite(
                contextMenu.sample
              );

              setContextMenu(null);
            }}
          >
            {contextMenu.sample.isFavorite
              ? "★ Remove from Favorites"
              : "☆ Add to Favorites"}
          </button>

          <div className="context-menu-separator" />

          <button
            className="context-menu-item context-menu-danger"
            onClick={() => {
              void handleDeleteSample(
                contextMenu.sample
              );
            }}
          >
            Delete from computer…
          </button>
        </div>
      )}
    </main>
  );
  

}

export default App;