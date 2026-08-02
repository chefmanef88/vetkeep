# ADR-003: Offline sync engine, and the local database decision that is still open

**Status:** Accepted for the engine. The local database choice is deliberately deferred.
**Date:** 2 August 2026
**Relates to:** brief sections 15.2, 15.4, 15.5, 15.6

## Context

VetKeep is for veterinarians working out of a vehicle in places where connectivity is
intermittent. Section 15.1 is unambiguous: the application has to stay clinically useful with
zero signal. The server is the shared state and the backup target, not a prerequisite for
opening a patient or documenting a consultation.

Two things stood between the product and that promise, and they are not the same kind of
problem.

The first is a decision. Section 15.2 requires a proof of concept on **two physical devices**
before full offline feature work begins: offline creation, restart and reboot without data
loss, push and pull of at least 10,000 records, tombstones, competing edits to the same draft
SOAP section, schema migration with unsynced rows present, and revoked-device behaviour. RxDB
is the preferred starting option with WatermelonDB as the fallback, and section 24 makes
passing that proof of concept a Phase 0 exit gate.

The second is engineering that the choice does not affect: what the queue does with a
mutation, how a conflict on a clinical note differs from a conflict on a route ordering, when
a retry becomes a permanent failure, and when a checkpoint may move.

## Decision

**Build the second, defer the first.**

`@vetkeep/sync` contains the mutation queue, the conflict policy table, retry pacing, and
checkpoint advancement. It talks to a `SyncStorage` interface with seven methods. It has no
dependency on RxDB, WatermelonDB, SQLite, or React Native, and its behaviour is exercised by
unit tests against an in-memory storage double.

The local database is **not chosen in this ADR**. Selecting one now would mean either running
the two-device proof of concept the brief requires, which needs hardware, or writing an
architecture record asserting a conclusion nobody has evidence for. The second is worse than
having no record at all, because it looks like a decision.

Alongside the engine, the server gained optimistic concurrency
(`202608020006_phase3_optimistic_concurrency.sql`). This was needed regardless of which local
database wins: without a server-side version check there is no way to detect a stale write at
all, and the engine's entire conflict path would be unreachable code.

## The conflict table, and why it is not configurable

Section 15.6 assigns a policy per record type. The implementation makes `EntityType` a closed
union and the policy map a total `Record` over it, so a new syncable table cannot reach the
queue without a policy being chosen for it. That is a compile error by design.

The failure this prevents is specific. A generic sync layer defaults to last-write-wins
because it is the only rule that works without knowing what the data means. Applied to a
clinical note, last-write-wins means one veterinarian's observation of an animal silently
replaces another's, with nothing in the record showing it happened. For a signed visit it
would be worse still, because the record is supposed to be immutable.

So the policies are:

| Record                               | Policy                   | Why                                                         |
| ------------------------------------ | ------------------------ | ----------------------------------------------------------- |
| Completed visit, amendment           | `reject_immutable`       | A signed record is corrected by appending, never by editing |
| Draft consultation text              | `manual_section`         | Two assessments of one animal is a clinical question        |
| Examination finding                  | `manual_per_system`      | Scope the conflict to the system that differs               |
| Client, patient, ownership           | `manual_compare`         | A reverted phone number is a client who cannot be reached   |
| Appointment status                   | `validate_transition`    | A stale transition is rejected against the state machine    |
| Inventory movement, invoice, payment | `idempotent_never_merge` | Merging two versions double-counts money or stock           |
| Route stop, display preference       | `last_write_wins`        | Nothing clinical is at stake                                |

## Consequences

The engine can be tested, reviewed and corrected now, while it is cheap. When the proof of
concept picks a database, the work is to implement seven methods, not to discover that the
conflict rules were wrong.

The optimistic concurrency check is opt-in: a caller passing no version keeps the previous
overwrite behaviour. The web application, which edits one record in one tab against a live
connection, is unaffected. Only a client that knows which version it read pays the cost of
being told it is stale. That also means **the guarantee is only as good as the callers**: a
client that omits the version gets no conflict detection, and the web app currently omits it.

**Not yet built, and load-bearing for the offline promise:**

- The local database and its schema, pending section 15.2.
- Attachment upload queue with resumable state (section 15.4).
- Tombstone purging after all registered devices have observed a deletion (section 15.7).
- The conflict resolution screen (section 15.6): local value, server value, last modified time
  and device, and the three safe actions.
- Wiring the engine into the mobile app, which today requires connectivity on every screen.

## Alternatives considered

**Pick RxDB now and adjust later.** Rejected. Section 15.2 exists because replication,
encryption, bundle size and React Native storage support are the kind of constraints that only
surface under real use on real hardware. An ADR recording a preference as a decision would
give the next person false confidence.

**Field-level automatic merge everywhere.** Rejected by section 15.6, and rightly. Merging two
clinical narratives produces a note no veterinarian wrote and none would sign.

**Server-side last-write-wins with an audit trail.** Rejected. An audit trail records that
data was lost; it does not prevent the loss, and nobody reads it in time.
