export type DemoPolicyVersion = {
  title: string;
  type: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  filename: string;
};

// Fictional Northstar policies used only to exercise version-aware retrieval.
// Superseded versions stay published for audit/history, but their effective
// date windows keep them out of current answers.
export const demoPolicyVersions: DemoPolicyVersion[] = [
  {
    title: "Northstar Leave and Time Away Policy",
    type: "leave",
    version: "1.0",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-03-31",
    filename: "leave-time-away-v1.0.md",
  },
  {
    title: "Northstar Leave and Time Away Policy",
    type: "leave",
    version: "2.0",
    effectiveFrom: "2026-04-01",
    effectiveTo: null,
    filename: "leave-time-away-v2.0.md",
  },
  {
    title: "Northstar Business Expense Policy",
    type: "expenses",
    version: "1.0",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-06-30",
    filename: "business-expenses-v1.0.md",
  },
  {
    title: "Northstar Business Expense Policy",
    type: "expenses",
    version: "2.0",
    effectiveFrom: "2026-07-01",
    effectiveTo: null,
    filename: "business-expenses-v2.0.md",
  },
  {
    title: "Northstar Remote Work Guide",
    type: "remote_work",
    version: "1.0",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-04-30",
    filename: "remote-work-v1.0.md",
  },
  {
    title: "Northstar Remote Work Guide",
    type: "remote_work",
    version: "2.0",
    effectiveFrom: "2026-05-01",
    effectiveTo: null,
    filename: "remote-work-v2.0.md",
  },
  {
    title: "Northstar New Starter Guide",
    type: "onboarding",
    version: "1.0",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-11-30",
    filename: "new-starter-v1.0.md",
  },
  {
    title: "Northstar New Starter Guide",
    type: "onboarding",
    version: "2.0",
    effectiveFrom: "2025-12-01",
    effectiveTo: null,
    filename: "new-starter-v2.0.md",
  },
  {
    title: "Northstar Relocation Support Guide",
    type: "relocation",
    version: "1.0",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-31",
    filename: "relocation-support-v1.0.md",
  },
  {
    title: "Northstar Relocation Support Guide",
    type: "relocation",
    version: "2.0",
    effectiveFrom: "2026-02-01",
    effectiveTo: null,
    filename: "relocation-support-v2.0.md",
  },
  {
    title: "Northstar Learning and Development Reimbursement Policy",
    type: "learning",
    version: "1.0",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-05-31",
    filename: "learning-development-v1.0.md",
  },
  {
    title: "Northstar Learning and Development Reimbursement Policy",
    type: "learning",
    version: "2.0",
    effectiveFrom: "2026-06-01",
    effectiveTo: null,
    filename: "learning-development-v2.0.md",
  },
  {
    title: "Northstar Respectful Workplace and Reporting Policy",
    type: "workplace_conduct",
    version: "1.0",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-02-28",
    filename: "respectful-workplace-v1.0.md",
  },
  {
    title: "Northstar Respectful Workplace and Reporting Policy",
    type: "workplace_conduct",
    version: "2.0",
    effectiveFrom: "2026-03-01",
    effectiveTo: null,
    filename: "respectful-workplace-v2.0.md",
  },
];
