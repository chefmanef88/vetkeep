import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { exportPractice, type ExportCounts } from "@/features/records/practice-export";
import { Card, Muted, ScrollScreen } from "@/ui/practice-components";
import { PageHeader } from "@/ui/elements";
import { ErrorText, PrimaryButton } from "@/ui/components";
import { fonts, hairline, palette, radiusControl, space, type } from "@/ui/tokens";

/**
 * Take a copy of everything (brief §17.1).
 *
 * Reachable on its own rather than only from the closing flow, because the
 * moment a veterinarian most wants a backup is not the moment they are leaving.
 */
export default function ExportScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ counts: ExportCounts; fileName: string } | null>(null);

  async function run() {
    setError(null);
    setDone(null);
    setBusy(true);
    const result = await exportPractice();
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone({ counts: result.counts, fileName: result.fileName });
  }

  return (
    <ScrollScreen>
      <PageHeader
        title="Export your practice"
        subtitle="Everything you have recorded, in one file"
      />

      <Card>
        <View style={styles.head}>
          <Ionicons name="download-outline" size={20} color={palette.brandInk} />
          <Text style={styles.headTitle}>What you get</Text>
        </View>
        <Muted>
          Clients, folders and ownership history, every consultation with its examination and
          amendments, treatments with their withholding dates, vaccinations and dewormings, your
          product list, and invoices with payments.
        </Muted>
        <Muted>
          Photographs and documents are listed with where they are stored rather than packed into
          the file, so the export stays small enough to send.
        </Muted>
      </Card>

      <Card>
        <View style={styles.head}>
          <Ionicons name="code-slash-outline" size={20} color={palette.quiet} />
          <Text style={styles.headTitle}>Why it is not a PDF</Text>
        </View>
        {/* A per-record PDF already exists for handing to a client. This is a
            different job and the format follows from it. */}
        <Muted>
          This file is meant to be read by another system, not by a person. To hand a client
          something they can read, share a single record or a folder&rsquo;s history from that
          folder instead.
        </Muted>
      </Card>

      {done ? (
        <Card>
          <View style={styles.head}>
            <Ionicons name="checkmark-circle" size={20} color={palette.green} />
            <Text style={styles.headTitle}>Saved</Text>
          </View>
          <View style={styles.counts}>
            <Count value={done.counts.clients} label="clients" />
            <Count value={done.counts.patients} label="folders" />
            <Count value={done.counts.visits} label="records" />
          </View>
          <View style={styles.counts}>
            <Count value={done.counts.treatments} label="treatments" />
            <Count value={done.counts.preventive_care} label="vaccinations" />
            <Count value={done.counts.attachments} label="attachments" />
          </View>
          <Text style={styles.file}>{done.fileName}</Text>
          <Muted>
            Keep this somewhere you will still have it if you lose the phone. It is a complete copy
            of your clinical records.
          </Muted>
        </Card>
      ) : null}

      <Card>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          label={busy ? "Preparing…" : done ? "Export again" : "Export everything"}
          disabled={busy}
          onPress={() => void run()}
        />
        <Muted>Every export is recorded in your audit trail, including when it was saved.</Muted>
      </Card>
    </ScrollScreen>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  headTitle: { ...type.strong, fontSize: 16, color: palette.ink },
  counts: { flexDirection: "row", gap: space.sm },
  count: {
    flex: 1,
    backgroundColor: palette.ground,
    borderRadius: radiusControl,
    padding: space.md,
    gap: 2
  },
  countValue: { fontFamily: fonts.semibold, fontSize: 20, color: palette.ink },
  countLabel: { ...type.small, fontSize: 11, color: palette.quiet },
  file: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: palette.quiet,
    borderTopWidth: hairline,
    borderTopColor: palette.line,
    paddingTop: space.md
  }
});
