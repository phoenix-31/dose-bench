import { createBrowserRouter, Navigate, useParams } from "react-router";
import { App, LegacyHashRedirect } from "@/App";
import { DEFAULT_MODULE, isModuleId, type ModuleId } from "@/lib/modules";
import { CompileView } from "@/views/CompileView";
import { EmbedView } from "@/views/EmbedView";
import { RecoveryView } from "@/views/RecoveryView";
import { RunPage } from "@/views/RunPage";

/** Renders a per-module view, or sends an unknown module id to the default one. */
function WithModule({ view, render }: { view: string; render: (id: ModuleId) => React.ReactNode }) {
  const { module } = useParams();
  if (!module || !isModuleId(module)) return <Navigate to={`/${view}/${DEFAULT_MODULE}`} replace />;
  return render(module);
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <App />,
      children: [
        { index: true, element: <LegacyHashRedirect fallback={`/run/${DEFAULT_MODULE}`} /> },
        {
          path: "run/:module?",
          element: <WithModule view="run" render={(id) => <RunPage key={id} moduleId={id} />} />,
        },
        {
          path: "compile/:module?",
          element: <WithModule view="compile" render={(id) => <CompileView key={id} moduleId={id} />} />,
        },
        {
          path: "recovery/:module?",
          element: <WithModule view="recovery" render={(id) => <RecoveryView key={id} moduleId={id} />} />,
        },
        { path: "embed", element: <EmbedView /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  // Vite's base (e.g. /dose-bench/ on GitHub Pages) without the trailing slash.
  { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" },
);
