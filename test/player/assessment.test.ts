import { describe, expect, it } from "vitest";
import { assessPlayback } from "../../src/player/assessment.js";

const qualityRank = { LOW: 0, HIGH: 1, LOSSLESS: 2, HI_RES_LOSSLESS: 3 };

describe("assessPlayback — length", () => {
  it("is unknown until both durations are known", () => {
    expect(assessPlayback({ actualSeconds: 200 }).length).toBe("unknown");
    expect(assessPlayback({ expectedSeconds: 200 }).length).toBe("unknown");
    expect(assessPlayback({}).ok).toBe(true);
  });

  it("accepts a stream within tolerance of the catalogue length", () => {
    const a = assessPlayback({ expectedSeconds: 204, actualSeconds: 203.4 });
    expect(a.length).toBe("match");
    expect(a.ok).toBe(true);
    expect(a.issues).toEqual([]);
    expect(a.lengthRatio).toBeCloseTo(203.4 / 204);
  });

  it("flags a 30s clip against a full track as a preview", () => {
    const a = assessPlayback({ expectedSeconds: 204, actualSeconds: 30.1 });
    expect(a.isLikelyPreview).toBe(true);
    expect(a.length).toBe("short");
    expect(a.issues).toEqual([
      { code: "preview", actualSeconds: 30.1, expectedSeconds: 204 },
    ]);
  });

  it("flags a merely short stream without calling it a preview", () => {
    const a = assessPlayback({ expectedSeconds: 200, actualSeconds: 150 });
    expect(a.isLikelyPreview).toBe(false);
    expect(a.issues).toEqual([
      { code: "short", actualSeconds: 150, expectedSeconds: 200 },
    ]);
  });

  it("flags a stream that runs past the catalogue length", () => {
    const a = assessPlayback({ expectedSeconds: 180, actualSeconds: 420 });
    expect(a.length).toBe("long");
    expect(a.issues.map((issue) => issue.code)).toEqual(["long"]);
  });

  it("ignores zero and non-finite durations", () => {
    expect(
      assessPlayback({ expectedSeconds: 0, actualSeconds: 200 }).length,
    ).toBe("unknown");
    expect(
      assessPlayback({ expectedSeconds: 200, actualSeconds: Infinity }).length,
    ).toBe("unknown");
    expect(
      assessPlayback({ expectedSeconds: 200, actualSeconds: NaN }).length,
    ).toBe("unknown");
  });
});

describe("assessPlayback — quality", () => {
  it("reports a downgrade against the caller's ranking", () => {
    const a = assessPlayback(
      {
        requestedQuality: "LOSSLESS",
        deliveredQuality: "high",
        codecs: "mp4a.40.2",
      },
      { qualityRank },
    );
    expect(a.downgraded).toBe(true);
    expect(a.lossless).toBe(false);
    expect(a.issues).toEqual([
      {
        code: "downgraded",
        requestedQuality: "LOSSLESS",
        deliveredQuality: "HIGH",
      },
    ]);
  });

  it("never reports a downgrade without a ranking", () => {
    expect(
      assessPlayback({ requestedQuality: "LOSSLESS", deliveredQuality: "LOW" })
        .downgraded,
    ).toBe(false);
  });

  it("does not guess when a tier is missing or unranked", () => {
    expect(
      assessPlayback({ deliveredQuality: "HIGH" }, { qualityRank }).downgraded,
    ).toBe(false);
    expect(
      assessPlayback(
        { requestedQuality: "WEIRD", deliveredQuality: "LOW" },
        { qualityRank },
      ).downgraded,
    ).toBe(false);
  });

  it("marks FLAC and ALAC delivery as lossless", () => {
    expect(assessPlayback({ codecs: "flac" }).lossless).toBe(true);
    expect(assessPlayback({ codecs: " ALAC " }).lossless).toBe(true);
    expect(assessPlayback({ codecs: "eac3" }).lossless).toBe(false);
  });

  it("lists a length issue before a quality issue", () => {
    const a = assessPlayback(
      {
        expectedSeconds: 200,
        actualSeconds: 150,
        requestedQuality: "LOSSLESS",
        deliveredQuality: "LOW",
      },
      { qualityRank },
    );
    expect(a.issues.map((issue) => issue.code)).toEqual([
      "short",
      "downgraded",
    ]);
  });
});

describe("assessPlayback — embed mode", () => {
  it("raises no issues for a black-box embed player but keeps the facts", () => {
    const a = assessPlayback(
      {
        mode: "embed",
        expectedSeconds: 204,
        actualSeconds: 30,
        requestedQuality: "LOSSLESS",
        deliveredQuality: "LOW",
      },
      { qualityRank },
    );
    expect(a.ok).toBe(true);
    expect(a.issues).toEqual([]);
    expect(a.isLikelyPreview).toBe(true);
    expect(a.downgraded).toBe(true);
  });
});
