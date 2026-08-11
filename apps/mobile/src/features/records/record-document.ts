/**
 * The client's copy of a consultation record (brief §10.6).
 *
 * This is not the public passport. The passport is a link for a third party and
 * is restricted to identity and vaccination status; this goes to the owner of
 * the animal, who is entitled to the whole record and may need it for a
 * referral, a sale, or a second opinion.
 *
 * Built as a string so the content can be tested without a device. Rendering it
 * to a file is the caller's job.
 */

export type DocumentVet = {
  fullName: string;
  businessName: string | null;
  licenseNumber: string | null;
  licenseVerified: boolean;
  phoneDisplay: string;
};

export type DocumentClient = {
  name: string;
  clientCode: string;
  phoneDisplay: string;
};

export type DocumentFolder = {
  name: string;
  patientCode: string;
  species: string;
  kind: string;
  purpose: string;
  breed: string | null;
  sex: string | null;
  headCount: number | null;
  identifier: string | null;
  identifierLabel: string | null;
  /**
   * A data URI, never a link. The attachments bucket is private and a signed
   * URL expires, so a document carrying one would show a broken image to the
   * owner a week later. Inlined bytes travel with the file.
   */
  photoDataUri?: string | null;
};

export type DocumentRecord = {
  /** The VK-R- reference both the vet and the client can name. */
  recordCode: string | null;
  visitDate: string;
  visitType: string;
  workflowStatus: string;
  chiefComplaint: string | null;
  historyOfComplaint: string | null;
  temperatureC: string | null;
  heartRateBpm: string | null;
  respiratoryRateBpm: string | null;
  weightValue: string | null;
  weightUnit: string;
  definitiveDiagnosis: string | null;
  tentativeDiagnosis: string | null;
  treatmentPlan: string | null;
  prescriptions: string | null;
  followUpPlan: string | null;
  nextReviewDate: string | null;
  abnormalFindings: { systemName: string; remarks: string | null }[];
  treatments?: DocumentTreatment[];
};

export type DocumentTreatment = {
  productName: string;
  doseValue: string;
  doseUnit: string;
  route: string;
  durationDays: number | null;
  animalsTreated: number | null;
  meatWithholdUntil: string | null;
  milkWithholdUntil: string | null;
  eggsWithholdUntil: string | null;
};

export type RecordDocumentInput = {
  vet: DocumentVet;
  client: DocumentClient;
  folder: DocumentFolder;
  record: DocumentRecord;
  generatedAt: Date;
};

/**
 * Everything placed into the document comes from a database the vet controls,
 * but it is still free text typed by a person and is going into markup. A
 * client's animal called "Bobby & <Sons>" must not be able to break the page.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function section(title: string, body: string | null): string {
  if (!body || body.trim() === "") return "";
  return `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p></section>`;
}

function row(label: string, value: string | null): string {
  if (!value || value.trim() === "") return "";
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

/** A vital is only shown when it was taken. A blank row implies it was zero. */
function vitals(record: DocumentRecord): string {
  const entries = [
    record.temperatureC ? `Temperature ${record.temperatureC} °C` : null,
    record.heartRateBpm ? `Heart rate ${record.heartRateBpm} bpm` : null,
    record.respiratoryRateBpm ? `Respiratory rate ${record.respiratoryRateBpm} bpm` : null,
    record.weightValue ? `Weight ${record.weightValue} ${record.weightUnit}` : null
  ].filter((entry): entry is string => entry !== null);

  if (entries.length === 0) return "";
  return `<section><h2>Examination</h2><p>${entries.map(escapeHtml).join(" &nbsp;·&nbsp; ")}</p></section>`;
}

function abnormal(record: DocumentRecord): string {
  if (record.abnormalFindings.length === 0) return "";
  const items = record.abnormalFindings
    .map(
      (finding) =>
        `<li><strong>${escapeHtml(finding.systemName)}</strong>${
          finding.remarks ? ` — ${escapeHtml(finding.remarks)}` : ""
        }</li>`
    )
    .join("");
  return `<section><h2>Abnormal findings</h2><ul>${items}</ul></section>`;
}

/**
 * The animal's picture, when there is one.
 *
 * Only a data URI is accepted. Anything else — an http link, a file path — is
 * refused rather than rendered, because a document that reaches out to a private
 * bucket shows the owner a broken image once the signature expires.
 */
function portrait(folder: DocumentFolder): string {
  const uri = folder.photoDataUri;
  if (!uri || !uri.startsWith("data:image/")) return "";
  return `<img class="portrait" src="${escapeHtml(uri)}" alt="${escapeHtml(folder.name)}"/>`;
}

/**
 * Treatments given, and the withholding they create.
 *
 * The withholding block is the single most consequential thing on this page. A
 * farmer reads it to know when milk can be sold or an animal slaughtered, so it
 * is set apart rather than listed among the medicines, and it is stated as a
 * date rather than a number of days the reader has to count forward from.
 */
function treatments(record: DocumentRecord): string {
  const given = record.treatments ?? [];
  if (given.length === 0) return "";

  const rows = given
    .map((treatment) => {
      const course = treatment.durationDays ? ` for ${treatment.durationDays} days` : "";
      const count = treatment.animalsTreated ? ` · ${treatment.animalsTreated} animals` : "";
      return `<li><strong>${escapeHtml(treatment.productName)}</strong> — ${escapeHtml(
        `${treatment.doseValue} ${treatment.doseUnit}`
      )}, ${escapeHtml(treatment.route.replace(/_/g, " "))}${escapeHtml(course)}${escapeHtml(count)}</li>`;
    })
    .join("");

  const holds: string[] = [];
  const latest = (pick: (t: DocumentTreatment) => string | null): string | null =>
    given
      .map(pick)
      .filter((value): value is string => value !== null)
      .sort()
      .pop() ?? null;

  const milk = latest((t) => t.milkWithholdUntil);
  const eggs = latest((t) => t.eggsWithholdUntil);
  const meat = latest((t) => t.meatWithholdUntil);
  if (milk) holds.push(`Milk must not be sold or consumed before ${formatDate(milk)}`);
  if (eggs) holds.push(`Eggs must not be sold or consumed before ${formatDate(eggs)}`);
  if (meat) holds.push(`This animal must not be slaughtered for meat before ${formatDate(meat)}`);

  const withholding =
    holds.length === 0
      ? ""
      : `<div class="withholding">
  <h2>Withholding periods</h2>
  <ul>${holds.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
</div>`;

  return `<section><h2>Treatments given</h2><ul>${rows}</ul></section>${withholding}`;
}

function folderLine(folder: DocumentFolder): string {
  if (folder.kind === "group") {
    const head = folder.headCount === null ? "" : ` · ${folder.headCount} head`;
    return `${folder.species}${head} · kept for ${folder.purpose}`;
  }
  return [folder.species, folder.breed, folder.sex?.replace("_", " ")]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function buildRecordDocument(input: RecordDocumentInput): string {
  const { vet, client, folder, record } = input;
  const diagnosis = record.definitiveDiagnosis ?? record.tentativeDiagnosis;
  // Stated when it is not settled, so an owner does not read a working theory
  // as a conclusion.
  const diagnosisLabel = record.definitiveDiagnosis ? "Diagnosis" : "Working diagnosis";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(folder.name)} — ${escapeHtml(formatDate(record.visitDate))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, "Helvetica Neue", sans-serif; color: #17211B; margin: 0; padding: 32px; line-height: 1.5; }
  header { border-bottom: 3px solid #174D35; padding-bottom: 16px; margin-bottom: 24px; }
  .practice { font-size: 20px; font-weight: 700; color: #174D35; margin: 0; }
  .practice-meta { font-size: 12px; color: #536159; margin: 4px 0 0; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .subject { background: #F7F8F5; padding: 16px; margin-bottom: 24px; display: flex; gap: 16px; align-items: flex-start; }
  .subject-body { flex: 1; }
  .portrait { width: 96px; height: 96px; border-radius: 48px; object-fit: cover; flex-shrink: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th { text-align: left; color: #536159; font-weight: 500; width: 34%; padding: 3px 0; vertical-align: top; }
  td { padding: 3px 0; }
  section { margin-bottom: 18px; page-break-inside: avoid; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #536159; margin: 0 0 4px; }
  p { margin: 0; font-size: 14px; }
  ul { margin: 0; padding-left: 18px; font-size: 14px; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #DFE5DF; font-size: 11px; color: #536159; }
  .withholding { background: #FDF6EA; border-left: 5px solid #8A5209; padding: 14px 16px; margin: 18px 0; page-break-inside: avoid; }
  .withholding h2 { color: #8A5209; }
  .withholding li { font-weight: 700; font-size: 14px; }
  .draft { background: #FDF6EA; border-left: 4px solid #8A5209; padding: 12px; margin-bottom: 20px; font-size: 13px; }
</style>
</head>
<body>
<header>
  <p class="practice">${escapeHtml(vet.businessName ?? vet.fullName)}</p>
  <p class="practice-meta">
    ${escapeHtml(vet.fullName)}${vet.licenseNumber ? ` · Licence ${escapeHtml(vet.licenseNumber)}` : ""}${vet.licenseVerified ? " (verified)" : ""}
    · ${escapeHtml(vet.phoneDisplay)}
  </p>
</header>

${
  record.workflowStatus === "draft"
    ? `<div class="draft">This record is unsigned and may still change. It is not a final clinical record.</div>`
    : ""
}

<div class="subject">
  ${portrait(folder)}
  <div class="subject-body">
    <h1>${escapeHtml(folder.name)}</h1>
    <table>
      ${row("Animal", folderLine(folder))}
      ${record.recordCode ? row("Record", record.recordCode) : ""}
      ${row("Animal file", folder.patientCode)}
      ${folder.identifierLabel ? row(folder.identifierLabel, folder.identifier) : ""}
      ${row("Owner", `${client.name} (${client.clientCode})`)}
      ${row("Attended", `${formatDate(record.visitDate)} · ${record.visitType.replace(/_/g, " ")}`)}
    </table>
  </div>
</div>

${section("Reason for the visit", record.chiefComplaint)}
${section("History", record.historyOfComplaint)}
${vitals(record)}
${abnormal(record)}
${section(diagnosisLabel, diagnosis)}
${section("Treatment given", record.treatmentPlan)}
${treatments(record)}
${section("Medicines and instructions", record.prescriptions)}
${section("Home care and follow-up", record.followUpPlan)}
${record.nextReviewDate ? section("Next review", formatDate(record.nextReviewDate)) : ""}

<footer>
  Issued ${escapeHtml(formatDate(input.generatedAt.toISOString()))} by ${escapeHtml(vet.fullName)}.
  Keep this with the animal's papers. Bring it to any other veterinarian who sees this animal.
</footer>
</body>
</html>`;
}

/** A filename a person can find again in their downloads. */
export function documentFileName(folder: DocumentFolder, record: DocumentRecord): string {
  const day = new Date(record.visitDate).toISOString().slice(0, 10);
  const safeName = folder.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safeName || "record"}-${day}.pdf`;
}

export function folderFileName(folder: DocumentFolder, generatedAt: Date): string {
  const day = generatedAt.toISOString().slice(0, 10);
  const safeName = folder.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safeName || "folder"}-history-${day}.pdf`;
}

/**
 * The whole folder: every record in the animal's history, newest first.
 *
 * The case for this is an animal changing hands or being referred. One
 * consultation out of context can mislead — a cough in March and the same cough
 * in June are a different clinical picture from either alone.
 *
 * Voided records are included and marked. A history that quietly omits what was
 * withdrawn is not a history, and the receiving vet needs to know something was
 * retracted rather than to never learn it existed.
 */
export function buildFolderDocument(input: {
  vet: DocumentVet;
  client: DocumentClient;
  folder: DocumentFolder;
  records: DocumentRecord[];
  generatedAt: Date;
}): string {
  const { vet, client, folder, records } = input;

  const entries =
    records.length === 0
      ? `<section><p>No consultations have been recorded for this animal.</p></section>`
      : records
          .map((record) => {
            const diagnosis = record.definitiveDiagnosis ?? record.tentativeDiagnosis;
            const label = record.definitiveDiagnosis ? "Diagnosis" : "Working diagnosis";
            const voided = record.workflowStatus === "voided";
            return `<article class="entry${voided ? " voided" : ""}">
  <h2 class="entry-date">${escapeHtml(formatDate(record.visitDate))} · ${escapeHtml(record.visitType.replace(/_/g, " "))}${
    voided ? " · WITHDRAWN" : ""
  }</h2>
  ${section("Reason for the visit", record.chiefComplaint)}
  ${section("History", record.historyOfComplaint)}
  ${vitals(record)}
  ${abnormal(record)}
  ${section(label, diagnosis)}
  ${section("Treatment given", record.treatmentPlan)}
  ${treatments(record)}
  ${section("Medicines and instructions", record.prescriptions)}
  ${section("Home care and follow-up", record.followUpPlan)}
</article>`;
          })
          .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(folder.name)} — full history</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, "Helvetica Neue", sans-serif; color: #17211B; margin: 0; padding: 32px; line-height: 1.5; }
  header { border-bottom: 3px solid #174D35; padding-bottom: 16px; margin-bottom: 24px; }
  .practice { font-size: 20px; font-weight: 700; color: #174D35; margin: 0; }
  .practice-meta { font-size: 12px; color: #536159; margin: 4px 0 0; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .subject { background: #F7F8F5; padding: 16px; margin-bottom: 24px; display: flex; gap: 16px; align-items: flex-start; }
  .subject-body { flex: 1; }
  .portrait { width: 96px; height: 96px; border-radius: 48px; object-fit: cover; flex-shrink: 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th { text-align: left; color: #536159; font-weight: 500; width: 34%; padding: 3px 0; vertical-align: top; }
  td { padding: 3px 0; }
  .entry { border-top: 1px solid #DFE5DF; padding-top: 14px; margin-bottom: 18px; page-break-inside: avoid; }
  .entry-date { font-size: 14px; color: #174D35; text-transform: none; letter-spacing: 0; margin: 0 0 8px; }
  .voided { opacity: 0.62; }
  .voided .entry-date { color: #8F1D1D; }
  section { margin-bottom: 10px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #536159; margin: 0 0 3px; }
  p { margin: 0; font-size: 14px; }
  ul { margin: 0; padding-left: 18px; font-size: 14px; }
  .withholding { background: #FDF6EA; border-left: 5px solid #8A5209; padding: 14px 16px; margin: 18px 0; page-break-inside: avoid; }
  .withholding h2 { color: #8A5209; }
  .withholding li { font-weight: 700; font-size: 14px; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #DFE5DF; font-size: 11px; color: #536159; }
</style>
</head>
<body>
<header>
  <p class="practice">${escapeHtml(vet.businessName ?? vet.fullName)}</p>
  <p class="practice-meta">
    ${escapeHtml(vet.fullName)}${vet.licenseNumber ? ` · Licence ${escapeHtml(vet.licenseNumber)}` : ""}${vet.licenseVerified ? " (verified)" : ""}
    · ${escapeHtml(vet.phoneDisplay)}
  </p>
</header>

<div class="subject">
  ${portrait(folder)}
  <div class="subject-body">
    <h1>${escapeHtml(folder.name)} — full history</h1>
    <table>
      ${row("Animal", folderLine(folder))}
      ${row("Record for", folder.patientCode)}
      ${folder.identifierLabel ? row(folder.identifierLabel, folder.identifier) : ""}
      ${row("Owner", `${client.name} (${client.clientCode})`)}
      ${row("Consultations", String(records.length))}
    </table>
  </div>
</div>

${entries}

<footer>
  Issued ${escapeHtml(formatDate(input.generatedAt.toISOString()))} by ${escapeHtml(vet.fullName)}.
  Records marked WITHDRAWN were retracted and should not be relied on, but are shown so the history is complete.
</footer>
</body>
</html>`;
}
