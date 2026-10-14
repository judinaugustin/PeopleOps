import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { query, pool } from "@/lib/db";
import { lexicalScore } from "@/lib/chunk";
import { answerQuestion, retrieve } from "@/lib/ai";
type Case = {
  id: string;
  question: string;
  expectedTitle: string | null;
  expectedOutcome: "grounded" | "abstain";
};
type ExpectedVersion = {
  title: string;
  version: string;
  effectiveFrom: string;
};
async function main() {
  const lines = (
    await readFile(resolve("tests/eval/hr_policy_cases.jsonl"), "utf8")
  )
    .trim()
    .split(/\r?\n/);
  const cases = lines.map((line) => JSON.parse(line) as Case);
  const expectedVersions = JSON.parse(
    await readFile(resolve("tests/eval/current_policy_versions.json"), "utf8"),
  ) as ExpectedVersion[];
  const { rows } = await query<{ title: string; content: string }>(
    "SELECT d.title,c.content FROM document_chunks c JOIN documents d ON d.id=c.document_id WHERE d.status='published' AND d.effective_from<=CURRENT_DATE AND (d.effective_to IS NULL OR d.effective_to>=CURRENT_DATE)",
  );
  if (!rows.length)
    throw new Error(
      "No published policy chunks. Run npm run db:migrate and npm run db:seed first.",
    );
  let expectedHit = 0;
  const currentVersions = await query<{
    title: string;
    version_label: string;
    effective_from: string;
  }>(
    "SELECT title,version_label,effective_from::text FROM documents WHERE status='published' AND effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)",
  );
  const versionChecks = expectedVersions.map((expected) => {
    const matches = currentVersions.rows.filter(
      (actual) => actual.title === expected.title,
    );
    const actual = matches[0];
    return {
      title: expected.title,
      expected: `${expected.version} from ${expected.effectiveFrom}`,
      actual: actual
        ? `${actual.version_label} from ${actual.effective_from}`
        : "missing",
      pass:
        matches.length === 1 &&
        actual.version_label === expected.version &&
        actual.effective_from === expected.effectiveFrom,
    };
  });
  const liveChecks: {
    question: string;
    expected: string[];
    answer: string;
    citations: string[];
    retrieved: string[];
    pass: boolean;
  }[] = [];
  if (process.argv.includes("--live")) {
    if (!process.env.OPENAI_API_KEY)
      throw new Error("Set OPENAI_API_KEY to run live answer checks.");
    const org = await query<{ id: string }>(
      "SELECT id FROM organizations WHERE name='Northstar Demo Organization' LIMIT 1",
    );
    const organizationId = org.rows[0]?.id;
    if (!organizationId)
      throw new Error("Run npm run db:seed before the live policy evaluation.");
    const liveCases = [
      {
        title: "Northstar Business Expense Policy",
        question:
          "Under the current expense policy, what is the claim deadline and receipt exception threshold?",
        expected: ["45 calendar days", "USD 50"],
        alternatives: [
          ["45 calendar days", "within 45 days", "45-day"],
          ["USD 50", "$50", "50 dollars"],
        ],
      },
      {
        title: "Northstar Leave and Time Away Policy",
        question:
          "How much notice is requested for five consecutive workdays of leave, and what is the carryover cap?",
        expected: ["10 business days", "48 hours"],
        alternatives: [
          ["10 business days", "ten business days"],
          ["48 hours", "forty-eight hours"],
        ],
      },
      {
        title: "Northstar Remote Work Guide",
        question:
          "How many weekly in-person anchor days are in the current remote work guide?",
        expected: ["one anchor day"],
        alternatives: [
          [
            "one anchor day",
            "one in-person anchor day",
            "one weekly in-person anchor day",
            "1 anchor day",
            "one day per week",
          ],
        ],
      },
      {
        title: "Northstar Relocation Support Guide",
        question:
          "What are the current standard relocation reimbursement cap and expense submission deadline?",
        expected: ["USD 4,000", "90 calendar days"],
        alternatives: [
          ["USD 4,000", "$4,000", "4,000 dollars"],
          ["90 calendar days", "within 90 days", "90-day"],
        ],
      },
      {
        title: "Northstar Relocation Support Guide",
        question: "What should we do if I have to relocate to Berlin?",
        expected: ["contact People Operations", "before signing"],
        alternatives: [
          ["contact People Operations", "speak with People Operations"],
          ["before signing", "before you sign", "before committing"],
        ],
      },
      {
        title: "Northstar Learning and Development Reimbursement Policy",
        question: "What is the current annual learning reimbursement limit?",
        expected: ["USD 1,500"],
        alternatives: [["USD 1,500", "$1,500", "1,500 dollars"]],
      },
      {
        title: "Northstar Respectful Workplace and Reporting Policy",
        question:
          "How soon should People Operations acknowledge a workplace concern report?",
        expected: ["three business days"],
        alternatives: [["three business days", "3 business days"]],
      },
    ];
    for (const item of liveCases) {
      const result = await retrieve(item.question, organizationId, "employee");
      const answer = await answerQuestion(item.question, result.chunks);
      const citedCurrentVersion =
        answer.citations.length > 0 &&
        answer.citations.some((citation) => citation.title === item.title) &&
        answer.citations.every((citation) => citation.version_label === "2.0");
      const answerMatches = item.alternatives.every((alternatives) =>
        alternatives.some((phrase) =>
          answer.answer.toLowerCase().includes(phrase.toLowerCase()),
        ),
      );
      liveChecks.push({
        question: item.question,
        expected: item.expected,
        answer: answer.answer,
        citations: answer.citations.map(
          (citation) => `${citation.title} v${citation.version_label}`,
        ),
        retrieved: result.chunks.map(
          (chunk) =>
            `${chunk.title} v${chunk.version_label} (distance ${chunk.distance?.toFixed(3) ?? "n/a"})`,
        ),
        pass:
          answer.status === "grounded" && citedCurrentVersion && answerMatches,
      });
    }
  }
  for (const item of cases) {
    const hits = rows
      .map((row) => ({
        title: row.title,
        score: lexicalScore(item.question, row.content),
      }))
      .filter((row) => row.score >= 0.25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (
      item.expectedTitle &&
      hits.some((hit) => hit.title === item.expectedTitle)
    )
      expectedHit++;
  }
  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes("--live") ? "live_openai" : "lexical_demo",
        caseCount: cases.length,
        policyChunkCount: rows.length,
        expectedDocumentHitRate: `${expectedHit}/${cases.filter((c) => c.expectedTitle).length}`,
        currentPolicyVersions: `${versionChecks.filter((item) => item.pass).length}/${versionChecks.length}`,
        versionChecks,
        ...(process.argv.includes("--live")
          ? {
              liveAnswerChecks: `${liveChecks.filter((item) => item.pass).length}/${liveChecks.length}`,
              liveChecks,
            }
          : {}),
        limitations:
          "Document hit rate is a lexical proxy, not answer correctness or citation support. Abstention behavior is not scored by the lexical mode.",
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Evaluation failed.",
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
