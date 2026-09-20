import { describe, expect, it } from "vitest";
import { SpeechQueue, voiceFor } from "./agentVoices";

/** A queue whose "speaking" is a resolvable promise, so tests control time. */
function queueOf() {
  const said: string[] = [];
  let finish: (() => void) | null = null;
  const q = new SpeechQueue((text) => {
    said.push(text);
    return new Promise<void>((resolve) => {
      finish = () => {
        finish = null;
        resolve();
      };
    });
  });
  // The queue leaves a breath between speakers, so this waits past it.
  const settle = () => new Promise((r) => setTimeout(r, 340));
  return { q, said, finish: () => finish?.(), settle };
}

describe("the speech queue", () => {
  it("says one line at a time, in order", async () => {
    const { q, said, finish, settle } = queueOf();
    q.push("1", "gp", "first");
    q.push("2", "principal", "second");
    await settle();

    expect(said).toEqual(["first"]);
    finish();
    await settle();
    expect(said).toEqual(["first", "second"]);
  });

  it("replaces what one speaker still has queued, and cuts them off mid line", async () => {
    const { q, said, finish, settle } = queueOf();
    q.push("1", "narrator", "the old line");
    await settle();
    q.replace("2", "narrator", "the line that is true now");
    finish(); // the real stopSpeaking() ends the line being cut off
    await settle();

    expect(said).toEqual(["the old line", "the line that is true now"]);
    expect(q.pending).toBe(0);
  });

  it("holds the floor for something else, and picks up after it", async () => {
    const { q, said, finish, settle } = queueOf();
    q.push("1", "narrator", "a line");
    await settle();
    finish();

    // A call opens: nothing here may talk over the person on the other end.
    q.hold();
    q.push("2", "narrator", "not while they are talking");
    await settle();
    expect(said).toEqual(["a line"]);

    q.release();
    await settle();
    expect(said).toEqual(["a line", "not while they are talking"]);
  });

  it("gives each seat its own voice, and the narrator one of its own", () => {
    expect(voiceFor("gp").voiceId).not.toBe(voiceFor("principal").voiceId);
    expect(voiceFor("narrator").browser).toEqual({ gender: "female", slot: 2 });
  });
});
