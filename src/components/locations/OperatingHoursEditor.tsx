import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Clock, Copy } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface DayHours {
  closed: boolean;
  open: string | null;
  close: string | null;
}

export interface OperatingHours {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
}

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

const DEFAULT_HOURS: DayHours = { closed: false, open: "09:00", close: "22:00" };

const getDefaultOperatingHours = (): OperatingHours => ({
  mon: { ...DEFAULT_HOURS },
  tue: { ...DEFAULT_HOURS },
  wed: { ...DEFAULT_HOURS },
  thu: { ...DEFAULT_HOURS },
  fri: { ...DEFAULT_HOURS },
  sat: { ...DEFAULT_HOURS },
  sun: { closed: true, open: null, close: null },
});

interface OperatingHoursEditorProps {
  value: OperatingHours | null;
  onSave: (hours: OperatingHours) => Promise<void>;
  isSaving?: boolean;
}

export function OperatingHoursEditor({ value, onSave, isSaving }: OperatingHoursEditorProps) {
  const [hours, setHours] = useState<OperatingHours>(value || getDefaultOperatingHours());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setHours(value || getDefaultOperatingHours());
    setHasChanges(false);
    setErrors({});
  }, [value]);

  const updateDay = (day: keyof OperatingHours, field: keyof DayHours, val: string | boolean) => {
    setHours((prev) => {
      const newHours = { ...prev };
      newHours[day] = { ...newHours[day], [field]: val };
      
      // Clear times if closing
      if (field === "closed" && val === true) {
        newHours[day].open = null;
        newHours[day].close = null;
      }
      // Set defaults if opening
      if (field === "closed" && val === false && !newHours[day].open) {
        newHours[day].open = "09:00";
        newHours[day].close = "22:00";
      }
      
      return newHours;
    });
    setHasChanges(true);
    setErrors((prev) => ({ ...prev, [day]: "" }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    DAYS.forEach(({ key }) => {
      const dayHours = hours[key];
      if (!dayHours.closed) {
        if (!dayHours.open || !dayHours.close) {
          newErrors[key] = "Times required when open";
        } else if (dayHours.close <= dayHours.open) {
          newErrors[key] = "Close time must be after open time";
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast({ title: "Please fix the errors", variant: "destructive" });
      return;
    }
    
    try {
      await onSave(hours);
      setHasChanges(false);
      toast({ title: "Operating hours saved" });
    } catch (error) {
      toast({ title: "Failed to save hours", variant: "destructive" });
    }
  };

  const copyToAll = () => {
    const source = hours.mon;
    setHours((prev) => {
      const newHours = { ...prev };
      DAYS.forEach(({ key }) => {
        newHours[key] = { ...source };
      });
      return newHours;
    });
    setHasChanges(true);
  };

  const copyToWeekdays = () => {
    const source = hours.mon;
    setHours((prev) => {
      const newHours = { ...prev };
      (["mon", "tue", "wed", "thu", "fri"] as const).forEach((key) => {
        newHours[key] = { ...source };
      });
      return newHours;
    });
    setHasChanges(true);
  };

  const copyToWeekends = () => {
    const source = hours.sat;
    setHours((prev) => ({
      ...prev,
      sat: { ...source },
      sun: { ...source },
    }));
    setHasChanges(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Operating Hours
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Copy className="h-3 w-3 mr-1" /> Quick Fill
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyToAll}>Copy Monday to all days</DropdownMenuItem>
              <DropdownMenuItem onClick={copyToWeekdays}>Copy Monday to weekdays</DropdownMenuItem>
              <DropdownMenuItem onClick={copyToWeekends}>Copy Saturday to weekends</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {DAYS.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-[80px_60px_1fr] items-center gap-2">
            <Label className="text-sm font-medium">{label}</Label>
            <div className="flex items-center gap-1">
              <Switch
                checked={!hours[key].closed}
                onCheckedChange={(checked) => updateDay(key, "closed", !checked)}
              />
              <span className="text-xs text-muted-foreground">
                {hours[key].closed ? "Closed" : "Open"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={hours[key].open || ""}
                onChange={(e) => updateDay(key, "open", e.target.value)}
                disabled={hours[key].closed}
                className="h-8 w-28"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                value={hours[key].close || ""}
                onChange={(e) => updateDay(key, "close", e.target.value)}
                disabled={hours[key].closed}
                className="h-8 w-28"
              />
              {errors[key] && (
                <span className="text-xs text-destructive">{errors[key]}</span>
              )}
            </div>
          </div>
        ))}
        
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={!hasChanges || isSaving} size="sm">
            {isSaving ? "Saving..." : "Save Hours"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
