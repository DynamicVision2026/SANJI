import { getRuntimeConfig } from "@/config/runtime";

/**
 * Placeholder landing page. UI screens (§12) are out of scope until Weeks 5+
 * (§18); this exists only so the app builds and the environment wiring is
 * visible. Do not build product UI here yet (issue: "Not in scope").
 */
export default function HomePage() {
  const config = getRuntimeConfig();
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>SANJI (千字)</h1>
      <p>
        Kanji diagnostic and parent-reporting layer for private tutoring schools
        in Japan.
      </p>
      <p>
        Environment: <code>{config.appEnv}</code>
      </p>
      <p style={{ color: "#666" }}>
        Pre-development skeleton. See <code>docs/spec-v2.2.md</code> for the
        specification. UI is out of scope until Weeks 5+ (§18).
      </p>
    </main>
  );
}
