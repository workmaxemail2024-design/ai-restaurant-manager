import { useLocations } from "@/hooks/useLocations";

export function CatalogueLocations({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: locations = [] } = useLocations();
  return <fieldset className="space-y-1">
    <legend className="text-sm font-medium">Assigned locations</legend>
    {locations.map(location => <label className="flex items-center gap-2 text-sm" key={location.id}>
      <input type="checkbox" checked={value.includes(location.id)}
        onChange={event => onChange(event.target.checked ? [...value, location.id] : value.filter(id => id !== location.id))} />
      {location.name}
    </label>)}
    <p className="text-xs text-muted-foreground">Recorded stock, recipes and purchases also link records to their locations.</p>
  </fieldset>;
}
