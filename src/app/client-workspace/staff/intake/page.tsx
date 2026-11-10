import { notFound } from "next/navigation";
import Button from "@/components/ui/Button";
import { requireWorkspaceIdentity } from "@/consulting/server/workspace";
import { workspaceIntakeOptions, workspaceIntakeReview } from "@/consulting/server/workspace-intake";
import IntakeForm from "./IntakeForm";

function bookingTime(date: Date, timeZone: string) {
  try { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date); }
  catch { return date.toISOString(); }
}

export default async function WorkspaceIntake({
  searchParams,
}: { searchParams: Promise<{ intent?: string | string[]; engagement?: string | string[] }> }) {
  const actor = await requireWorkspaceIdentity();
  const options = await workspaceIntakeOptions(actor.id);
  if (!options) notFound();
  const params = await searchParams;
  const intent = typeof params.intent === "string" ? params.intent : "";
  const target = options.engagements.find(({ id }) => id === params.engagement);
  const review = intent && target ? await workspaceIntakeReview(actor.id, target.id, intent) : null;

  return <section className="max-w-3xl">
    <h1>Booking intake</h1>
    <p className="mt-3">Review the visitor’s selected brief and choose what to carry into a private Discovery draft.</p>
    {options.candidates.length && options.engagements.length ? <form method="get" action="/staff/intake" className="mt-6 grid gap-4">
      <label>Confirmed booking<select name="intent" className="field mt-1 w-full" defaultValue={intent} required>
        <option value="">Select a booking</option>
        {options.candidates.map((booking) => <option key={booking.intent_id} value={booking.intent_id}>
          {bookingTime(booking.starts_at, booking.time_zone)} · {booking.time_zone} · Brief v{booking.brief_version} · {booking.booking_uid.slice(-8)}
        </option>)}
      </select></label>
      <label>Destination engagement<select name="engagement" className="field mt-1 w-full" defaultValue={target?.id ?? ""} required>
        <option value="">Select an engagement</option>
        {options.engagements.map(({ id, title, client }) => <option key={id} value={id}>{client} · {title}</option>)}
      </select></label>
      <div><Button>Review shared brief</Button></div>
    </form> : <p className="mt-6">No shared briefs or eligible destination engagements are available.</p>}
    {intent && target && !review && <p className="mt-6" role="status">This shared brief is unavailable. Choose a current booking.</p>}
    {review && target && <div className="mt-6 border-t border-rule pt-5">
      <h2>Review brief v{review.brief_version}</h2>
      <p className="mt-2">For {target.client} · {target.title}. Only selected visitor statements enter the draft.</p>
      <IntakeForm key={`${target.id}:${review.intent_id}:${review.confirmation_version}:${review.booking_uid}`}
        review={review} engagementId={target.id} />
    </div>}
  </section>;
}
