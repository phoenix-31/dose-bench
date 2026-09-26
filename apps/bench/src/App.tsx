import { NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_MODULE, MODULES, getEngine, isModuleId, type ModuleId } from "@/lib/modules";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "run", label: "Run live", perModule: true },
  { id: "compile", label: "Compile tree", perModule: true },
  { id: "recovery", label: "Recovery test", perModule: true },
  { id: "embed", label: "Embed", perModule: false },
] as const;

export function App() {
  const { module } = useParams();
  const { pathname } = useLocation();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const moduleId: ModuleId = module && isModuleId(module) ? module : DEFAULT_MODULE;
  const current = VIEWS.find((v) => pathname.startsWith(`/${v.id}`));
  const engine = getEngine(moduleId);
  // Participant mode shows only what a participant would see.
  const focus = current?.id === "run" && search.get("focus") === "1";

  // The Outlet stays at the same place in the tree in both modes, so toggling participant mode doesn't
  // remount the run page (and its session).
  return (
    <div className={focus ? "contents" : "mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-6 sm:px-6"}>
      {!focus && (
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-lg"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5 fill-none stroke-current"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12h4l3-7 4 14 3-7h4" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl leading-tight font-bold tracking-tight">DOSE Bench</h1>
              <p className="text-muted-foreground text-sm">
                Bayesian adaptive preference elicitation, running entirely in your browser
              </p>
            </div>
          </div>
          {current?.perModule !== false && (
            <Select value={moduleId} onValueChange={(v) => navigate(`/${current?.id ?? "run"}/${v}`)}>
              <SelectTrigger className="w-48" aria-label="Module">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </header>
      )}

      {!focus && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav
            aria-label="Views"
            className="bg-muted text-muted-foreground inline-flex h-9 w-fit max-w-full items-center overflow-x-auto rounded-lg p-[3px]"
          >
            {VIEWS.map((v) => (
              <NavLink
                key={v.id}
                to={v.perModule ? `/${v.id}/${moduleId}` : `/${v.id}`}
                className={({ isActive }) =>
                  cn(
                    "focus-visible:ring-ring/50 inline-flex h-[calc(100%-1px)] items-center rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-none",
                    isActive && "bg-card text-foreground shadow-sm",
                  )
                }
              >
                {v.label}
              </NavLink>
            ))}
          </nav>
          {current?.perModule !== false && (
            <span className="text-muted-foreground font-mono text-xs">
              {engine.nPoints.toLocaleString()} grid points · {engine.nQuestions} candidate questions · table
              built in {Math.round(engine.initMs)} ms
            </span>
          )}
        </div>
      )}

      <main>
        <Outlet />
      </main>

      {!focus && (
        <footer className="text-muted-foreground max-w-3xl border-t pt-4 text-xs leading-relaxed">
          Implements the method of Chapman, Snowberg, Wang &amp; Camerer, "Dynamically Optimized Sequential
          Experimentation (DOSE) for Estimating Economic Preference Parameters", NBER WP 33013 (2024).
          Parameter ranges follow the paper's YouGov implementation; the question space is a reconstruction.
          1,000 points ≈ $1.
        </footer>
      )}
    </div>
  );
}
