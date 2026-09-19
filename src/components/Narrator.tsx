// ============================================================================
// THE NARRATOR — one line, top centre, saying what is happening and why.
//
// Anyone who walks up mid-demo should be able to read the screen without the
// presenter. The stage rail says where you are; this says what it means.
// ============================================================================

export function Narrator({
  step,
  total,
  title,
  line,
}: {
  step?: number;
  total?: number;
  title: string;
  line: string;
}) {
  return (
    <div className="pointer-events-none mx-auto max-w-[440px] text-center" aria-live="polite">
      <p key={title} className="label narrate" style={{ color: "var(--accent)" }}>
        {step && total ? `Step ${step} of ${total} · ` : ""}
        {title}
      </p>
      {/* Keyed by stage, not by text: counts inside a line update in place
          instead of replaying the entrance on every batch. */}
      <p key={`${step}:${title}`} className="narrate mt-1.5 text-[13px] leading-snug text-ink/90 [text-shadow:0_1px_12px_var(--ground)]">
        {line}
      </p>
    </div>
  );
}
