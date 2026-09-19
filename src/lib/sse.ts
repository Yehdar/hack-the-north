"use client";

/**
 * POST + read a server-sent-event stream.
 *
 * EventSource can only GET, and the committee needs the founder's venture file
 * in the request body — so we read the stream off fetch by hand instead.
 */
export async function streamPost(
  url: string,
  body: unknown,
  onEvent: (e: Record<string, unknown>) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line; the trailing fragment is kept for
    // the next chunk because a frame can be split across reads.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        // A malformed frame should not kill the meeting.
      }
    }
  }
}
