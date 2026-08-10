import { describe, expect, it } from "vitest";
import {
  buildRecordDocument,
  documentFileName,
  escapeHtml,
  type DocumentFolder,
  type DocumentRecord,
  type RecordDocumentInput
} from "./record-document";

function input(overrides: {
  folder?: Partial<DocumentFolder>;
  record?: Partial<DocumentRecord>;
}): RecordDocumentInput {
  return {
    vet: {
      fullName: "Roland Armah",
      businessName: "Armah Mobile Veterinary",
      licenseNumber: "VCG-2211",
      licenseVerified: true,
      phoneDisplay: "024 123 4567"
    },
    client: { name: "Nana Adwoa", clientCode: "VK-C-3E1TA8", phoneDisplay: "050 247 0223" },
    folder: {
      name: "Cynthia",
      patientCode: "VK-P-20ZF03",
      species: "dog",
      kind: "individual",
      purpose: "pet",
      breed: "Mongrel",
      sex: "female",
      headCount: null,
      identifier: null,
      identifierLabel: null,
      ...overrides.folder
    },
    record: {
      visitDate: "2026-08-10T09:30:00.000Z",
      visitType: "home_call",
      workflowStatus: "completed",
      chiefComplaint: "Coughing for three days",
      historyOfComplaint: null,
      temperatureC: null,
      heartRateBpm: null,
      respiratoryRateBpm: null,
      weightValue: null,
      weightUnit: "kg",
      definitiveDiagnosis: null,
      tentativeDiagnosis: null,
      treatmentPlan: null,
      prescriptions: null,
      followUpPlan: null,
      nextReviewDate: null,
      abnormalFindings: [],
      ...overrides.record
    },
    generatedAt: new Date("2026-08-10T10:00:00.000Z")
  };
}

describe("escapeHtml", () => {
  it("neutralises markup so a typed name cannot break the page", () => {
    expect(escapeHtml('Bobby & <script>alert("x")</script>')).toBe(
      "Bobby &amp; &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });
});

describe("buildRecordDocument", () => {
  it("carries the practice identity, since it goes out under the vet's name", () => {
    const html = buildRecordDocument(input({}));
    expect(html).toContain("Armah Mobile Veterinary");
    expect(html).toContain("Roland Armah");
    expect(html).toContain("VCG-2211");
    expect(html).toContain("024 123 4567");
  });

  it("names the animal, the owner and both codes", () => {
    const html = buildRecordDocument(input({}));
    expect(html).toContain("Cynthia");
    expect(html).toContain("VK-P-20ZF03");
    expect(html).toContain("Nana Adwoa");
    expect(html).toContain("VK-C-3E1TA8");
  });

  it("escapes free text typed by a person", () => {
    const html = buildRecordDocument(input({ folder: { name: "Bobby & <b>Sons</b>" } }));
    expect(html).toContain("Bobby &amp; &lt;b&gt;Sons&lt;/b&gt;");
    expect(html).not.toContain("<b>Sons</b>");
  });

  it("calls an unsettled diagnosis a working diagnosis", () => {
    // An owner reading "Diagnosis" treats it as settled. A differential is not.
    const html = buildRecordDocument(input({ record: { tentativeDiagnosis: "Kennel cough" } }));
    expect(html).toContain("Working diagnosis");
    expect(html).toContain("Kennel cough");
  });

  it("calls a settled diagnosis a diagnosis", () => {
    const html = buildRecordDocument(
      input({ record: { definitiveDiagnosis: "Bordetella bronchiseptica" } })
    );
    expect(html).toContain(">Diagnosis<");
  });

  it("prefers the definitive diagnosis when both are present", () => {
    const html = buildRecordDocument(
      input({ record: { tentativeDiagnosis: "Kennel cough", definitiveDiagnosis: "Bordetella" } })
    );
    expect(html).toContain("Bordetella");
    expect(html).not.toContain("Kennel cough");
  });

  it("omits vitals that were never taken rather than printing blanks", () => {
    const html = buildRecordDocument(input({}));
    expect(html).not.toContain("Temperature");
    expect(html).not.toContain("Heart rate");
  });

  it("shows only the vitals that were taken", () => {
    const html = buildRecordDocument(input({ record: { temperatureC: "39.4" } }));
    expect(html).toContain("Temperature 39.4 °C");
    expect(html).not.toContain("Heart rate");
  });

  it("weighs a bird in the unit it was recorded in", () => {
    const html = buildRecordDocument(input({ record: { weightValue: "320", weightUnit: "g" } }));
    expect(html).toContain("Weight 320 g");
  });

  it("lists abnormal findings with their remarks", () => {
    const html = buildRecordDocument(
      input({
        record: {
          abnormalFindings: [{ systemName: "Respiratory", remarks: "Harsh lung sounds" }]
        }
      })
    );
    expect(html).toContain("Respiratory");
    expect(html).toContain("Harsh lung sounds");
  });

  it("describes a group by its head count and purpose", () => {
    const html = buildRecordDocument(
      input({
        folder: {
          name: "Layer house 2",
          kind: "group",
          species: "poultry",
          purpose: "eggs",
          headCount: 400,
          breed: null,
          sex: null
        }
      })
    );
    expect(html).toContain("400 head");
    expect(html).toContain("kept for eggs");
  });

  it("shows the animal's picture when there is one", () => {
    const html = buildRecordDocument(
      input({ folder: { photoDataUri: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" } })
    );
    expect(html).toContain('class="portrait"');
    expect(html).toContain("data:image/jpeg;base64,");
  });

  it("shows no picture when the folder has none", () => {
    const html = buildRecordDocument(input({}));
    expect(html).not.toContain('class="portrait"');
  });

  it("refuses a link where a data URI is required", () => {
    // A signed URL expires, so a document carrying one would show the owner a
    // broken image a week later. Better no picture than a broken one.
    const html = buildRecordDocument(
      input({ folder: { photoDataUri: "https://example.test/private/photo.jpg?token=abc" } })
    );
    expect(html).not.toContain('class="portrait"');
    expect(html).not.toContain("example.test");
  });

  it("refuses a non-image data URI", () => {
    const html = buildRecordDocument(
      input({ folder: { photoDataUri: "data:text/html;base64,PHNjcmlwdD4=" } })
    );
    expect(html).not.toContain('class="portrait"');
  });

  it("warns in the document itself when a record is unsigned", () => {
    // The interface should not offer this, so the document is a second guard.
    const html = buildRecordDocument(input({ record: { workflowStatus: "draft" } }));
    expect(html).toContain("unsigned");
  });

  it("says nothing about signing when the record is signed", () => {
    const html = buildRecordDocument(input({}));
    expect(html).not.toContain("unsigned");
  });
});

describe("documentFileName", () => {
  it("is findable later, by animal and date", () => {
    const { folder, record } = input({});
    expect(documentFileName(folder, record)).toBe("Cynthia-2026-08-10.pdf");
  });

  it("survives a name with spaces and punctuation", () => {
    const { folder, record } = input({ folder: { name: "Layer house 2 (back)" } });
    expect(documentFileName(folder, record)).toBe("Layer-house-2-back-2026-08-10.pdf");
  });

  it("falls back rather than producing a nameless file", () => {
    const { folder, record } = input({ folder: { name: "???" } });
    expect(documentFileName(folder, record)).toBe("record-2026-08-10.pdf");
  });
});
