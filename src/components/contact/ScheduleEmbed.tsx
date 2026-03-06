// src/components/contact/ScheduleEmbed.tsx
export default function ScheduleEmbed() {
  return (
    <div className="w-full overflow-hidden rounded-md border">
      <iframe
        title="Schedule"
        src="https://cal.com/spajewski/30min?embed=1"
        className="w-full min-h-[640px]"
        loading="lazy"
        allow="clipboard-write"
      />
    </div>
  );
}