import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppShell } from "./components/AppShell";

export function App() {
  const [dbStatus, setDbStatus] = useState("Checking SQLite...");

  useEffect(() => {
    invoke<string>("get_db_status")
      .then((status) => setDbStatus(status))
      .catch((error) => setDbStatus(`SQLite unavailable: ${String(error)}`));
  }, []);

  return (
    <AppShell
      sidebar={
        <section>
          <h2>Libraries</h2>
          <p>Sidebar placeholder for imported libraries.</p>
        </section>
      }
      content={
        <section>
          <h1>Language Learning Library</h1>
          <p>Content area placeholder for lessons and documents.</p>
          <p className="status">{dbStatus}</p>
        </section>
      }
    />
  );
}
