import { useLocation as useRouterLocation } from "react-router-dom";
import { MapPin } from "lucide-react";
import { LocationSelector } from "@/components/LocationSelector";
import { locationBarNote, routeLocationScope } from "@/lib/routeLocationScope";

/** One location indicator for every signed-in page, rendered by the shared protected shell. */
export function AppLocationBar() {
  const { pathname } = useRouterLocation();
  const scope = routeLocationScope(pathname);
  const note = locationBarNote(scope);
  return (
    <div
      role="region"
      aria-label="Selected location"
      className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur lg:ml-64"
    >
      <div className="flex min-h-12 flex-wrap items-center justify-end gap-x-3 gap-y-1 px-4 py-1.5 pl-16 sm:px-6 lg:pl-6">
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
        {scope === "all" ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            All locations
          </span>
        ) : (
          <LocationSelector compact />
        )}
      </div>
    </div>
  );
}
