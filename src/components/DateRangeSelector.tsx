import { DateRangePicker, DatePreset } from "@/components/common/DateRangePicker";
import { useDateRange } from "@/contexts/DateRangeContext";

export function DateRangeSelector() {
  const { preset, startDate, endDate, setDateRange } = useDateRange();

  const handleApply = (newStartDate: string, newEndDate: string, newPreset: DatePreset) => {
    setDateRange(newStartDate, newEndDate, newPreset);
  };

  return (
    <DateRangePicker
      startDate={startDate}
      endDate={endDate}
      preset={preset}
      onApply={handleApply}
    />
  );
}
