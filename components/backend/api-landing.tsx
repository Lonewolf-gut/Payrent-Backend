export function BackendApiLanding() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: "36rem",
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>PayRent Backend API</h1>
      <p style={{ marginTop: "0.75rem", color: "#555" }}>
        Business APIs run on this server (port 3001). Open the frontend app for the UI.
      </p>
      <p style={{ marginTop: "1rem" }}>
        <a href="/api/health" style={{ color: "#047857", textDecoration: "underline" }}>
          Check API health
        </a>
      </p>
    </main>
  );
}
