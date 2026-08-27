# Launch registrations — developer accounts and data protection

Three registrations gate release, and all three run on calendar time rather than
work time. None of them can be done by an assistant: each needs identity
documents, a payment method, and a person accepting legal terms in their own
name. What follows is everything needed to fill them in, so the sitting down is
short.

The facts in the data inventory below are read out of the schema and the
application, not remembered. Where something needs confirming on the day it says
so rather than guessing.

---

## 1. Apple Developer Program

**Cost and cadence:** USD 99 per year.
**Lead time:** usually days; longer if the account is a company rather than an
individual, because Apple verifies the legal entity.

**Decide first — individual or organisation.** This is hard to change later and
it changes what the store lists as the seller.

- _Individual_: fastest. The app is sold under a personal name.
- _Organisation_: needs a registered legal entity and a D-U-N-S number, which is
  free but takes its own days to obtain. The store then shows the business name.

If VetKeep is meant to look like a product rather than a side project to the
veterinarians paying for it, the organisation route is the one — but only start
it once the entity exists, because the D-U-N-S lookup fails otherwise.

**Have ready:** legal name exactly as on the identity document, the identity
document itself, a payment card that accepts recurring USD, and the entity's
registration details if applying as an organisation.

---

## 2. Google Play Console

**Cost:** USD 25, once.
**Lead time — this is the long pole.** Two clocks run in series:

1. Identity and address verification before anything can be published.
2. **Closed testing: 12 testers, opted in, for 14 continuous days**, before a
   production application is even accepted.

The 14 days cannot start until the account exists and a build is uploaded, and
the count resets if the tester group drops below twelve. Twelve real people who
will install and leave it installed is a recruitment problem, not a technical
one, and it is worth starting the list now.

**Have ready:** the same identity documents, a payment method, and the twelve
tester email addresses (Google accounts).

**Package name:** `com.vetkeep.mobile` — fixed at first upload and permanent.
Confirm it is what you want before the first build goes up, because it cannot be
changed afterwards without shipping a different app.

---

## 3. Ghana Data Protection Commission

Registration is required of data controllers under the Data Protection Act, 2012
(Act 843). **Confirm the current fee, renewal period and forms on the
Commission's own portal** — those change and are not worth taking from a
document like this one.

**The question to settle before filling anything in: who is the controller?**
This is not a formality, and the answer shapes the whole registration and the
privacy notice.

- Each veterinarian decides what to record about their own clients and why.
  That makes the veterinarian a controller of their client data.
- VetKeep holds it, determines how it is stored, secured and retained, and can
  reach it. That makes VetKeep at least a processor, and arguably a controller
  of the veterinarian's own account data.

The common shape is: **VetKeep is a controller for veterinarian account data and
a processor for client and clinical data.** That is a legal conclusion and worth
one conversation with a Ghanaian practitioner before it is filed, because it
determines who answers a subject access request from a farmer.

**The point that will draw attention:** the database holds personal data about
people who never installed the app and have no account — the veterinarian's
clients. Their name, phone number, WhatsApp number, email and address are in
there, along with the animals and treatments tied to them. A registration that
describes only the veterinarians is incomplete.

---

## Data inventory

Shared by all three registrations, and by the privacy notice §17 still needs.
Read from the schema on 27 August 2026.

### About the veterinarian — the account holder

| Data                      | Where                              |
| ------------------------- | ---------------------------------- |
| Full name                 | `vets.full_name`                   |
| Phone, WhatsApp number    | `vets.phone_display`, `whatsapp_*` |
| Business name             | `vets.business_name`               |
| Veterinary licence number | `vets.license_number`              |
| Service areas             | `vets.service_areas`               |
| Email address             | Supabase `auth.users`              |
| Devices used              | `vet_devices`                      |

### About the veterinarian's clients — people with no account

| Data                    | Where                                                          |
| ----------------------- | -------------------------------------------------------------- |
| Name                    | `clients.name`                                                 |
| Phone number            | `clients.phone_display`, `phone_e164`                          |
| WhatsApp number         | `clients.whatsapp_display`, `whatsapp_e164`                    |
| Email address           | `clients.email`                                                |
| Postal address          | `clients.address`                                              |
| Free-text notes         | `clients.notes`                                                |
| Consent to be contacted | `clients.communication_consent` and the timestamp it was given |

**Precise location is _not_ collected.** `clients.location_latitude` and
`location_longitude` exist and `create_client` accepts them, but nothing in
either application sends them, there is no location permission requested, and
`expo-location` is not a dependency. Declare **not collected** — and if that ever
changes, every declaration below changes with it.

### About the animals

Name, species, breed, sex, date of birth, colour and markings, microchip number,
ear tag, leg ring, identification notes, head count for a group. Not personal
data in itself, but attached to an identifiable owner, so it travels with them.

### Clinical

Consultation records, examination findings, diagnoses, treatments with
withholding periods, preventive care, invoices and payments, attachments and
photographs.

### Photographs

Taken with the camera or chosen from the photo library, via `expo-image-picker`.
Attached to records and to animal folders.

---

## Store data-safety answers

Google calls this the Data Safety form; Apple calls it Privacy Nutrition labels.
Both ask the same questions in different words. These answers follow from the
inventory above.

| Question                              | Answer                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| Collects personal information         | Yes — name, phone, email, address                                                      |
| Collects location                     | **No** (see above)                                                                     |
| Collects photos                       | Yes                                                                                    |
| Collects health information           | Yes, animal health, tied to an identified owner                                        |
| Collects financial information        | Yes — invoices and payments recorded in-app                                            |
| Encrypted in transit                  | Yes — HTTPS throughout                                                                 |
| Users can request deletion            | Yes — account closure is built (§17.2)                                                 |
| Users can export their data           | Yes — practice export is built (§17.1)                                                 |
| Data shared with third parties        | Supabase as the hosting processor. Confirm the region the project runs in and name it. |
| Data used for advertising or tracking | No                                                                                     |

**Two answers need a decision rather than a lookup:**

- **Retention period.** The code deliberately does not decide it: closure closes
  the account, revokes the devices and retains the clinical records, leaving the
  duration to policy. Both stores and the DPC will ask. It is a question for the
  Data Protection Act and the Veterinary Council's record-keeping requirements,
  and it belongs in the published notice.
- **Account deletion route.** Google requires a way to request deletion from
  outside the app as well as inside it, usually a web page. Closure exists in the
  application; a public URL that explains how to request it does not yet.

---

## Order of work

1. Start the **Google** account today. Its clock is the longest and everything
   else can proceed in parallel.
2. Start **Apple** the same day, or start the D-U-N-S application first if going
   the organisation route.
3. Begin recruiting the **twelve testers** immediately — this is the piece most
   likely to be the actual delay.
4. Settle the **controller/processor question** and the **retention period**,
   then file the **DPC** registration and publish the privacy notice.
