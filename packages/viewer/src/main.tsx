import "@xyflow/react/dist/style.css";
import "./card-theme.css";
import "./style.css";
import "./node-cards.css";
import "./panels.css";
import "./live.css";
import { createRoot } from "react-dom/client";
import { useLive, useLiveConnection } from "./live";
import { Workspace } from "./workspace";

function App() {
  useLiveConnection();
  const graph = useLive((state) => state.graph);
  const failed = useLive((state) => state.graphFailed);
  if (!graph)
    return (
      <main className="loading">
        {failed
          ? "Could not load the graph. Reconnecting…"
          : "Loading Flowlens…"}
      </main>
    );
  return <Workspace graph={graph} />;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
