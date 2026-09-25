export type DrumRackLabState = {
  startTime: number;
  endTime: number;
  reverse: boolean;

  loopEnabled: boolean;
  loopStartTime: number;
  loopEndTime: number;

  autoSmoothLoop: boolean;
  loopCrossfadeMs: number;
};

export type DrumRackSound = {
  rackId: string;

  sourceKind:
    | "library"
    | "temporary"
    | "rackAsset";

  sampleId: number | null;
  tempId: string | null;

  /*
    Present when a sound came from a saved
    Drum Rack preset's private stable asset.
  */
  rackAssetSlotId:
    | number
    | null;

  fileName: string;
  durationSeconds: number;
  tags: string[];

  audioUrl: string;

  /*
    When a temporary Rack sound was created from
    the Lab, keep enough provenance to reopen the
    ORIGINAL source sample with the exact same edit.

    Library sounds do not need labState: their
    sampleId is already enough to open a fresh Lab.

    These fields are intentionally optional so old
    saved Rack presets still load normally.
  */
  labSourceSampleId?:
    | number
    | null;

  labState?:
    | DrumRackLabState
    | null;
};
