export const DMARC_AGGREGATE_REPORT_SUBJECT_SQL =
  "Report domain:%Submitter:%Report-ID:%";

const DMARC_AGGREGATE_REPORT_SUBJECT =
  /^\s*Report domain:\s*.+?\s+Submitter:\s*.+?\s+Report-ID:\s*\S+\s*$/i;

export function automatedSupportEmailKind(subject: string) {
  if (DMARC_AGGREGATE_REPORT_SUBJECT.test(subject)) {
    return "dmarc_aggregate_report" as const;
  }
  return null;
}
