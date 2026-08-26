import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/practice/format";
import { HandleReminder } from "./handle-reminder";

export const dynamic = "force-dynamic";

/**
 * What is due, and who to tell (brief §12).
 *
 * Nothing sends yet. Delivery needs WhatsApp Business API credentials that do
 * not exist, so every reminder sits at "queued" — which is the honest state
 * rather than a defect. Until there is a provider, this page is the product:
 * a list of who to contact and why, with the number to ring.
 *
 * The queue itself is real. It fills when a record is signed with a review
 * date, when preventive care is recorded with a next due date, and when a
 * treatment creates a withholding period; and it empties when the reason
 * disappears — a voided record, a withdrawn consent.
 */

const LABELS: Record<string, string> = {
  follow_up: "Follow-up",
  vaccination_due: "Vaccination due",
  withdrawal_ends: "Withholding ends"
};

const TEMPLATE_LABELS: Record<string, string> = {
  follow_up_due: "review this animal",
  vaccination_due: "vaccination is coming due",
  deworming_due: "worming is coming due",
  parasite_control_due: "tick and flea treatment is coming due",
  withdrawal_ends: "milk or meat is safe again"
};

export default async function RemindersPage() {
  const supabase = await createClient();

  // Ninety days rather than thirty: a vet planning a farm round wants to see
  // what is coming, not only what has landed.
  const { data, error } = await supabase.rpc("due_reminders", { p_within_days: 90 });
  if (error) throw new Error("Unable to load reminders.");

  const reminders = data ?? [];
  const today = new Date();
  const overdue = reminders.filter((r) => new Date(r.send_at) <= today);
  const upcoming = reminders.filter((r) => new Date(r.send_at) > today);

  return (
    <>
      <section className="card stack">
        <h1>Reminders</h1>
        <p className="muted">What is due for your clients, and the number to reach them on.</p>
        {/* Said plainly rather than implied by an empty inbox. A vet who assumes
            these went out will not make the call. */}
        <p className="warning" role="status">
          Nothing is sent automatically yet. Messaging needs a WhatsApp Business account, which is
          not connected. Until then these are yours to act on — ring or message the client, then
          mark it done.
        </p>
      </section>

      <section className="card stack">
        <h2>Due now</h2>
        {overdue.length ? (
          <ul className="record-list">
            {overdue.map((reminder) => (
              <li key={reminder.id}>
                <div className="row-head">
                  <strong>{reminder.patient_name}</strong>
                  <span className="stock-low">{formatDate(reminder.send_at)}</span>
                </div>
                <span>
                  {LABELS[reminder.reminder_type] ?? reminder.reminder_type} —{" "}
                  {TEMPLATE_LABELS[reminder.template_key] ?? reminder.template_key}
                </span>
                <span className="muted">
                  {reminder.client_name}
                  {reminder.recipient_e164 ? ` · ${reminder.recipient_e164}` : ""}
                </span>
                <HandleReminder id={reminder.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing due.</p>
        )}
      </section>

      <section className="card stack">
        <h2>Coming up</h2>
        {upcoming.length ? (
          <ul className="record-list">
            {upcoming.map((reminder) => (
              <li key={reminder.id}>
                <div className="row-head">
                  <strong>{reminder.patient_name}</strong>
                  <span className="muted">{formatDate(reminder.send_at)}</span>
                </div>
                <span>
                  {LABELS[reminder.reminder_type] ?? reminder.reminder_type} —{" "}
                  {TEMPLATE_LABELS[reminder.template_key] ?? reminder.template_key}
                </span>
                <span className="muted">
                  {reminder.client_name}
                  {reminder.recipient_e164 ? ` · ${reminder.recipient_e164}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing in the next three months.</p>
        )}
      </section>
    </>
  );
}
