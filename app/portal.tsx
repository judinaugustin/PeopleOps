"use client";
import { FormEvent, useEffect, useState } from "react";

type User = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "hr" | "admin";
};
type Citation = {
  id: string;
  documentId: string;
  title: string;
  version: string;
  effectiveFrom: string;
  quote: string;
};
type RequestRow = {
  id: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  requester?: string;
  submitted_at?: string;
  events: RequestEvent[];
};
type RequestEvent = {
  id: string;
  actor: string;
  actorRole: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
};
type DocumentRow = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  version_label: string;
  effective_from: string;
  chunk_count: number;
};
type Conversation = {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
};
type Checklist = {
  id: string;
  title: string;
  status: string;
  items: { title: string; done: boolean }[];
  updated_at: string;
};
const navigation = [
  { id: "assistant", label: "Ask PeopleOps", icon: "✳" },
  { id: "checklists", label: "My checklists", icon: "☑" },
  { id: "policies", label: "Policy library", icon: "▤" },
];
const demoLogins =
  process.env.NODE_ENV === "production"
    ? []
    : [
        {
          role: "Employee",
          email: "employee@northstar.example",
          password: "change-me-employee",
        },
        {
          role: "HR reviewer",
          email: "hr@northstar.example",
          password: "change-me-hr",
        },
        {
          role: "Admin",
          email: "admin@northstar.example",
          password: "change-me-admin",
        },
      ];
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.error?.message ?? "Something went wrong. Please try again.",
    );
  return data;
}

export default function Portal() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [login, setLogin] = useState({
    email: "employee@northstar.example",
    password: "change-me-employee",
  });
  const [section, setSection] = useState("assistant");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [answerMode, setAnswerMode] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [assistantMessageId, setAssistantMessageId] = useState("");
  const [appMode, setAppMode] = useState("demo_lexical");
  const [conversationId, setConversationId] = useState("");
  const [asking, setAsking] = useState(false);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [requestNotes, setRequestNotes] = useState<Record<string, string>>({});
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [requestDraft, setRequestDraft] = useState({
    category: "policy_question",
    subject: "",
    description: "",
  });
  const [checkTitle, setCheckTitle] = useState("My onboarding checklist");
  const [checkItems, setCheckItems] = useState([
    "Confirm account access",
    "Meet with my manager",
    "Review the team handbook",
  ]);
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [policyTitle, setPolicyTitle] = useState("");
  const [policyType, setPolicyType] = useState("general");
  const [policyAudience, setPolicyAudience] = useState("all");
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [effectiveTo, setEffectiveTo] = useState("");
  const [previewDocId, setPreviewDocId] = useState("");
  const [previewChunks, setPreviewChunks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = async (current: User) => {
    try {
      const [r, d, c, k] = await Promise.all([
        api("/api/requests"),
        api("/api/documents"),
        api("/api/conversations"),
        api("/api/checklists"),
      ]);
      setRequests(r.requests);
      setDocs(d.documents);
      setAppMode(d.mode);
      setConversations(c.conversations);
      setChecklists(k.checklists);
      if (current.role === "admin")
        setMetrics(await api("/api/admin/evaluation"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspace.");
    }
  };
  useEffect(() => {
    api("/api/me")
      .then(async (d) => {
        if (d.user) {
          setUser(d.user);
          await refresh(d.user);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (user) void refresh(user);
  }, [section, user]);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(login),
      });
      setUser(data.user);
      await refresh(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(
      () => {},
    );
    setUser(null);
    setAnswer("");
    setCitations([]);
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setError("");
    const submittedQuestion = question.trim();
    try {
      const d = await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          question: submittedQuestion,
          conversationId: conversationId || undefined,
        }),
      });
      setConversationId(d.conversationId);
      setAssistantMessageId(d.messageId);
      setAnswer(d.answer);
      setCitations(d.citations ?? []);
      setLastQuestion(submittedQuestion);
      setAnswerMode(
        d.mode === "demo_lexical"
          ? "SIMULATED DEMO ANSWER"
          : d.status === "abstained"
            ? "AI · EVIDENCE NOT FOUND"
            : "AI · GROUNDED IN POLICY",
      );
      setQuestion("");
      await refresh(user!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Answer unavailable.");
    } finally {
      setAsking(false);
    }
  }
  async function saveRequest(event: FormEvent, submit: boolean) {
    event.preventDefault();
    if (
      submit &&
      !window.confirm(
        `Submit this request to the in-app reviewer queue?\n\nCategory: ${requestDraft.category}\nSubject: ${requestDraft.subject}\nDescription: ${requestDraft.description}\n\nSame-organization HR reviewers and admins can read these details. Nothing is emailed.`,
      )
    )
      return;
    setBusy(true);
    try {
      const d = await api("/api/requests", {
        method: "POST",
        body: JSON.stringify({ ...requestDraft, submit }),
      });
      setRequestDraft({
        category: "policy_question",
        subject: "",
        description: "",
      });
      await refresh(user!);
      setError(
        submit
          ? "Request submitted to the reviewer queue for HR and admin."
          : `Draft saved (${d.id.slice(0, 8)}).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save request.");
    } finally {
      setBusy(false);
    }
  }
  async function saveChecklist(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/checklists", {
        method: "POST",
        body: JSON.stringify({
          title: checkTitle,
          items: checkItems.map((title) => ({ title, done: false })),
        }),
      });
      await refresh(user!);
      setError("Checklist draft saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save checklist.");
    }
  }
  async function updateStatus(id: string, status: string) {
    try {
      await api(`/api/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "transition",
          status,
          note: requestNotes[id]?.trim(),
        }),
      });
      setRequestNotes((notes) => ({ ...notes, [id]: "" }));
      await refresh(user!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update request.");
    }
  }
  async function replyToRequest(id: string) {
    try {
      await api(`/api/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "reply",
          note: requestNotes[id]?.trim(),
        }),
      });
      setRequestNotes((notes) => ({ ...notes, [id]: "" }));
      await refresh(user!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reply.");
    }
  }
  function prepareRelocationRequest() {
    const rawPlace = lastQuestion.match(
      /\b(?:to|in)\s+([\p{L}][\p{L}-]+(?:\s+[\p{L}][\p{L}-]+)?)/iu,
    )?.[1];
    const place = rawPlace?.replace(/\b\p{L}/gu, (letter) =>
      letter.toLocaleUpperCase(),
    );
    setRequestDraft({
      category: "relocation",
      subject: `Relocation guidance${place ? ` for ${place}` : ""}`,
      description: `Please advise on the next steps for a potential relocation${place ? ` to ${place}` : ""}.\n\nMy policy question: ${lastQuestion}\n\nPeopleOps assistant response: ${answer}\n\nPlease confirm which parts of the relocation policy apply and whether I need an individual review.`,
    });
    setSection("requests");
    setError(
      "Relocation request prepared. Review the draft and submit it when ready.",
    );
  }
  async function uploadPolicy(event: FormEvent) {
    event.preventDefault();
    if (!policyFile) return;
    const form = new FormData();
    form.set("file", policyFile);
    form.set("title", policyTitle || policyFile.name);
    form.set("documentType", policyType);
    form.set("audience", policyAudience);
    form.set("effectiveFrom", effectiveFrom);
    form.set("effectiveTo", effectiveTo);
    setBusy(true);
    try {
      const d = await api("/api/documents", { method: "POST", body: form });
      setPreviewDocId(d.id);
      setPreviewChunks(d.preview ?? []);
      setError(`Policy saved as draft with ${d.chunkCount} text chunks.`);
      setPolicyFile(null);
      await refresh(user!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="loading">
        <div className="brand-mark">P</div>
        <p>Preparing your workspace…</p>
      </main>
    );
  if (!user)
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-row">
            <div className="brand-mark">P</div>
            <div>
              <b>PeopleOps</b>
              <small>POLICY COPILOT</small>
            </div>
          </div>
          <p className="eyebrow">A HUMAN-FIRST HR WORKSPACE</p>
          <h1>Good work starts with clear answers.</h1>
          <p className="muted">
            Find guidance in approved policies, then shape a draft when you need
            a human follow-up.
          </p>
          <form onSubmit={signIn} className="stack">
            <label>
              Email address
              <input
                type="email"
                autoComplete="username"
                value={login.email}
                onChange={(e) => setLogin({ ...login, email: e.target.value })}
                required
              />
            </label>
            <label>
              Password
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={login.password}
                  onChange={(e) =>
                    setLogin({ ...login, password: e.target.value })
                  }
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <button className="primary wide" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {demoLogins.length > 0 && (
            <div className="demo-credentials">
              <strong>Local demo accounts</strong>
              {demoLogins.map((item) => (
                <button
                  key={item.role}
                  onClick={() =>
                    setLogin({ email: item.email, password: item.password })
                  }
                >
                  {item.role}
                  <span>{item.email}</span>
                </button>
              ))}
            </div>
          )}
          <p className="privacy-note">
            Portfolio prototype · fictional policies only · never enter real or
            sensitive personal information.
          </p>
        </section>
        <aside className="login-art">
          <div className="art-orbit one" />
          <div className="art-orbit two" />
          <div className="art-note">
            <span>✳</span>
            <p>
              Find the answer.
              <br />
              <b>See the source.</b>
            </p>
            <small>PEOPLE, WITH CONTEXT.</small>
          </div>
          <div className="art-caption">A calmer way to navigate work.</div>
        </aside>
      </main>
    );
  const links = [
    ...navigation,
    ...(user.role === "employee"
      ? [{ id: "requests", label: "My requests", icon: "↗" }]
      : []),
    ...(user.role !== "employee"
      ? [
          {
            id: "hr",
            label: user.role === "admin" ? "Employee requests" : "HR inbox",
            icon: "◷",
          },
        ]
      : []),
    ...(user.role === "admin"
      ? [{ id: "admin", label: "Admin studio", icon: "⚙" }]
      : []),
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">P</div>
          <div>
            <b>PeopleOps</b>
            <small>POLICY COPILOT</small>
          </div>
        </div>
        <div className="org-switch">
          <span className="org-avatar">N</span>
          <span>
            <b>Northstar Demo</b>
            <small>Fictional organization</small>
          </span>
          <span className="chevron">⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {links.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setSection(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.id === "hr" && (
                <i>{requests.filter((r) => r.status === "submitted").length}</i>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-mini">
            <span>✦</span>
            <div>
              <b>Private by design</b>
              <small>Demo data stays local</small>
            </div>
          </div>
          <button className="profile" onClick={signOut}>
            <span className="profile-avatar">{user.name.slice(0, 1)}</span>
            <span>
              <b>{user.name}</b>
              <small>{user.role.replace("_", " ")}</small>
            </span>
            <span className="more">↗</span>
          </button>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Northstar</span>
            <b>/</b>
            <strong>
              {links.find((l) => l.id === section)?.label ?? "Workspace"}
            </strong>
          </div>
          <div className="top-actions">
            <span className="mode-chip">
              {appMode === "ai_ready"
                ? "AI MODE"
                : appMode === "ai_indexing"
                  ? "AI INDEX INCOMPLETE"
                  : "DEMO MODE"}
            </span>
            <button
              className="icon-button"
              aria-label="Help"
              onClick={() =>
                setError(
                  "This demo shares fictional policy information and creates drafts for human review. Do not enter real personal details.",
                )
              }
            >
              ?
            </button>
            <button className="avatar-small" title={user.name}>
              {user.name.slice(0, 1)}
            </button>
          </div>
        </header>
        <div className="notice">
          <span>ⓘ</span>
          <div>
            <b>Fictional demo workspace.</b> Use synthetic examples only. Do not
            enter real employee or sensitive personal data.
          </div>
        </div>
        {error && (
          <div role="status" className="toast">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {section === "assistant" && (
          <section className="content assistant-content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">YOUR POLICY DESK</p>
                <h1>What can I help you find?</h1>
                <p>
                  Answers come from approved policy passages, with the source
                  attached.
                </p>
              </div>
              <button
                className="quiet-button"
                onClick={() => {
                  setAnswer("");
                  setCitations([]);
                  setConversationId("");
                  setAssistantMessageId("");
                  setLastQuestion("");
                }}
              >
                ＋ New question
              </button>
            </div>
            <div className="chat-layout">
              <div className="chat-main">
                <div className="welcome-card">
                  <div className="sparkle">✳</div>
                  <div>
                    <h2>
                      Hi {user.name.split(" ")[0]}, let’s find some clarity.
                    </h2>
                    <p>
                      Ask about time away, onboarding, expenses, remote work, or
                      relocation.
                    </p>
                  </div>
                </div>
                {answer && (
                  <article className="answer-card">
                    <div className="answer-head">
                      <span
                        className={
                          answerMode.includes("SIMULATED")
                            ? "answer-badge demo"
                            : "answer-badge"
                        }
                      >
                        {answerMode}
                      </span>
                      <button
                        className="small-link"
                        onClick={() => {
                          setAnswer("");
                          setCitations([]);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <p className="answer-text">{answer}</p>
                    {citations.length > 0 && (
                      <div className="citation-list">
                        <strong>Sources used</strong>
                        {citations.map((c) => (
                          <a
                            key={c.id}
                            href={`/api/documents/${c.documentId}`}
                            onClick={async (e) => {
                              e.preventDefault();
                              try {
                                const d = await api(
                                  `/api/documents/${c.documentId}`,
                                );
                                setAnswer(
                                  `${d.document.title}\n\n${d.document.content}`,
                                );
                                setCitations([]);
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Source unavailable.",
                                );
                              }
                            }}
                            className="citation"
                          >
                            <span>↗</span>
                            <div>
                              <b>{c.title}</b>
                              <small>
                                Version {c.version} · effective{" "}
                                {c.effectiveFrom}
                              </small>
                              <q>{c.quote}</q>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                    {user.role === "employee" &&
                      answerMode.startsWith("AI") &&
                      /\brelocat(?:e|ion|ing)\b|\bmove\s+to\s+[\p{L}-]+/iu.test(
                        lastQuestion,
                      ) && (
                        <div className="request-handoff">
                          <div>
                            <b>Need guidance for your situation?</b>
                            <p>
                              Prepare a relocation request for a human reviewer.
                            </p>
                          </div>
                          <button
                            className="secondary"
                            onClick={prepareRelocationRequest}
                          >
                            Prepare HR request ↗
                          </button>
                        </div>
                      )}
                    {assistantMessageId && (
                      <div className="feedback-row">
                        <span>Was this answer useful?</span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api("/api/feedback", {
                                method: "POST",
                                body: JSON.stringify({
                                  messageId: assistantMessageId,
                                  rating: "helpful",
                                }),
                              });
                              setError("Thanks for the feedback.");
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Feedback could not be saved.",
                              );
                            }
                          }}
                        >
                          Helpful
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api("/api/feedback", {
                                method: "POST",
                                body: JSON.stringify({
                                  messageId: assistantMessageId,
                                  rating: "not_helpful",
                                }),
                              });
                              setError("Thanks for the feedback.");
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Feedback could not be saved.",
                              );
                            }
                          }}
                        >
                          Not helpful
                        </button>
                      </div>
                    )}
                  </article>
                )}
                <form className="composer" onSubmit={ask}>
                  <label htmlFor="question">Ask a policy question</label>
                  <textarea
                    id="question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g. What do I need to submit with a business expense?"
                    maxLength={1200}
                  />
                  <div className="composer-footer">
                    <span>
                      ✦ Policy answers cite their source · {question.length}
                      /1,200
                    </span>
                    <button
                      className="primary"
                      disabled={asking || question.trim().length < 3}
                    >
                      {asking ? (
                        <>
                          <i className="spinner" /> Looking…
                        </>
                      ) : (
                        <>
                          Ask PeopleOps <span>↑</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
                <div className="suggestion-row">
                  <span>TRY ASKING</span>
                  {[
                    "What should I do in my first week?",
                    "How do I submit an expense?",
                    "What should I know before relocating?",
                  ].map((s) => (
                    <button key={s} onClick={() => setQuestion(s)}>
                      {s} <span>↗</span>
                    </button>
                  ))}
                </div>
              </div>
              <aside className="chat-rail">
                <div className="rail-card">
                  <div className="rail-title">
                    <span>◷</span>
                    <b>Recent conversations</b>
                  </div>
                  {conversations.length ? (
                    conversations.slice(0, 6).map((c) => (
                      <div className="conversation-line" key={c.id}>
                        <button
                          className="conversation"
                          onClick={async () => {
                            try {
                              const history = await api(
                                `/api/conversations/${c.id}`,
                              );
                              setConversationId(c.id);
                              const lastAnswer = [...history.messages]
                                .reverse()
                                .find(
                                  (m: { role: string }) =>
                                    m.role === "assistant",
                                );
                              setAnswer(lastAnswer?.content ?? "");
                              setCitations(lastAnswer?.citations ?? []);
                              setAssistantMessageId(lastAnswer?.id ?? "");
                              setAnswerMode(
                                lastAnswer?.answer_status === "demo"
                                  ? "SIMULATED DEMO ANSWER"
                                  : lastAnswer?.answer_status === "abstained"
                                    ? "EVIDENCE NOT FOUND"
                                    : "GROUNDED IN POLICY",
                              );
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Conversation unavailable.",
                              );
                            }
                          }}
                        >
                          <span>{c.title || "New conversation"}</span>
                          <small>
                            {new Date(c.updated_at).toLocaleDateString()}
                          </small>
                        </button>
                        <button
                          className="delete-conversation"
                          aria-label={`Delete ${c.title || "conversation"}`}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                "Delete this conversation and its messages?",
                              )
                            )
                              return;
                            try {
                              await api(`/api/conversations/${c.id}`, {
                                method: "DELETE",
                              });
                              if (conversationId === c.id) {
                                setConversationId("");
                                setAnswer("");
                                setCitations([]);
                                setAssistantMessageId("");
                              }
                              await refresh(user!);
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Conversation could not be deleted.",
                              );
                            }
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="empty-small">
                      Your questions will appear here.
                    </p>
                  )}
                </div>
                <div className="rail-card helpful-card">
                  <div className="help-icon">?</div>
                  <h3>Need a human?</h3>
                  <p>
                    The assistant can explain policies, but People Operations
                    handles individual situations.
                  </p>
                  <button
                    onClick={() => setSection("requests")}
                    className="small-link"
                  >
                    Draft an HR request ↗
                  </button>
                </div>
                <div id="scope" className="rail-card scope-card">
                  <b>What this assistant does</b>
                  <p>
                    Shares information from approved policy documents and helps
                    prepare editable drafts.
                  </p>
                  <a href="#scope">See product scope ↗</a>
                </div>
              </aside>
            </div>
          </section>
        )}
        {section === "requests" && user.role === "employee" && (
          <section className="content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">PEOPLE OPERATIONS</p>
                <h1>Requests & follow-ups</h1>
                <p>
                  Draft a note for a human reviewer. Nothing is sent outside
                  this demo.
                </p>
              </div>
            </div>
            <div className="two-column">
              <form
                className="panel form-panel"
                onSubmit={(e) => saveRequest(e, false)}
              >
                <div className="panel-heading">
                  <span className="panel-icon">↗</span>
                  <div>
                    <h2>Start a request</h2>
                    <p>Keep it general. A reviewer can follow up with you.</p>
                  </div>
                </div>
                <label>
                  Request category
                  <select
                    value={requestDraft.category}
                    onChange={(e) =>
                      setRequestDraft({
                        ...requestDraft,
                        category: e.target.value,
                      })
                    }
                  >
                    <option value="policy_question">Policy question</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="relocation">Relocation</option>
                    <option value="expense">Expense process</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Subject
                  <input
                    value={requestDraft.subject}
                    maxLength={120}
                    onChange={(e) =>
                      setRequestDraft({
                        ...requestDraft,
                        subject: e.target.value,
                      })
                    }
                    required
                    minLength={3}
                  />
                </label>
                <label>
                  What would you like help with?
                  <textarea
                    value={requestDraft.description}
                    maxLength={2000}
                    onChange={(e) =>
                      setRequestDraft({
                        ...requestDraft,
                        description: e.target.value,
                      })
                    }
                    required
                    minLength={5}
                    placeholder="Describe the process question. Do not include personal or sensitive details."
                  />
                </label>
                <div className="form-warning">
                  Please don’t include medical, financial, identity, or other
                  sensitive information.
                </div>
                <div className="button-row">
                  <button className="secondary" disabled={busy}>
                    Save draft
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={(e) => {
                      e.preventDefault();
                      void saveRequest(
                        new Event("submit") as unknown as FormEvent,
                        true,
                      );
                    }}
                  >
                    Review & submit
                  </button>
                </div>
              </form>
              <div className="panel list-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Your requests</h2>
                    <p>{requests.length} items in your workspace</p>
                  </div>
                </div>
                {requests.length ? (
                  requests.map((r) => (
                    <div className="request-row" key={r.id}>
                      <div>
                        <span className={`status status-${r.status}`}>
                          {r.status.replaceAll("_", " ")}
                        </span>
                        <h3>{r.subject}</h3>
                        <p>
                          {r.category.replaceAll("_", " ")} ·{" "}
                          {new Date(
                            r.submitted_at ?? Date.now(),
                          ).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="chevron">↗</span>
                      {r.events?.length > 0 && (
                        <div className="request-thread">
                          <b>Request activity</b>
                          {r.events.map((event) => (
                            <div className="request-event" key={event.id}>
                              <strong>
                                {event.actor} · {event.actorRole}
                              </strong>
                              <small>
                                {new Date(event.createdAt).toLocaleString()}
                              </small>
                              {event.fromStatus !== event.toStatus && (
                                <span>
                                  Status: {event.toStatus.replaceAll("_", " ")}
                                </span>
                              )}
                              {event.note && <p>{event.note}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      {r.status === "waiting_on_employee" && (
                        <div className="request-reply">
                          <label>
                            Reply to People Operations
                            <textarea
                              value={requestNotes[r.id] ?? ""}
                              maxLength={1200}
                              onChange={(e) =>
                                setRequestNotes({
                                  ...requestNotes,
                                  [r.id]: e.target.value,
                                })
                              }
                              placeholder="Answer the reviewer’s question."
                            />
                          </label>
                          <button
                            className="primary"
                            disabled={
                              busy ||
                              (requestNotes[r.id] ?? "").trim().length < 2
                            }
                            onClick={() => void replyToRequest(r.id)}
                          >
                            Send reply and return to review
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <span>↗</span>
                    <b>No requests yet</b>
                    <p>
                      Your saved drafts and submitted requests will show here.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="scope-footnote">
              Your draft is stored in this local demo. Submitting adds it to the
              in-app HR queue for review; it does not send an email.
            </div>
          </section>
        )}
        {section === "checklists" && (
          <section className="content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">YOUR WORKSPACE</p>
                <h1>Checklists</h1>
                <p>Make a short, editable list to keep a process moving.</p>
              </div>
            </div>
            <div className="panel form-panel checklist-panel">
              <div className="panel-heading">
                <span className="panel-icon">☑</span>
                <div>
                  <h2>New checklist draft</h2>
                  <p>These are personal reminders, not HR approvals.</p>
                </div>
              </div>
              <form onSubmit={saveChecklist}>
                <label>
                  Checklist name
                  <input
                    value={checkTitle}
                    onChange={(e) => setCheckTitle(e.target.value)}
                    maxLength={120}
                  />
                </label>
                <label>
                  Items
                  {checkItems.map((item, index) => (
                    <div className="check-item" key={index}>
                      <span>☐</span>
                      <input
                        aria-label={`Checklist item ${index + 1}`}
                        value={item}
                        onChange={(e) =>
                          setCheckItems(
                            checkItems.map((v, i) =>
                              i === index ? e.target.value : v,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        aria-label="Remove item"
                        onClick={() =>
                          setCheckItems(
                            checkItems.filter((_, i) => i !== index),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </label>
                <button
                  type="button"
                  className="small-link add-item"
                  onClick={() => setCheckItems([...checkItems, ""])}
                >
                  ＋ Add an item
                </button>
                <div className="button-row">
                  <button className="primary">Save checklist draft</button>
                </div>
              </form>
            </div>
            {checklists.length > 0 && (
              <div className="panel saved-list-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Saved drafts</h2>
                    <p>Your checklist items are private to your account.</p>
                  </div>
                </div>
                {checklists.map((list) => (
                  <article className="saved-checklist" key={list.id}>
                    <div>
                      <b>{list.title}</b>
                      <span className="status status-draft">{list.status}</span>
                    </div>
                    <ul>
                      {list.items.map((item, index) => (
                        <li key={`${list.id}-${index}`}>
                          {item.done ? "☑" : "☐"} {item.title}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {section === "policies" && (
          <section className="content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">APPROVED KNOWLEDGE</p>
                <h1>Policy library</h1>
                <p>
                  Browse current fictional policies in the Northstar demo
                  workspace.
                </p>
              </div>
            </div>
            <div className="document-grid">
              {docs
                .filter((d) => d.status === "published")
                .map((d) => (
                  <article className="document-card" key={d.id}>
                    <span className="doc-icon">▤</span>
                    <span className="status status-published">
                      CURRENT POLICY
                    </span>
                    <h2>{d.title}</h2>
                    <p>
                      {d.document_type.replaceAll("_", " ")} · effective{" "}
                      {new Date(d.effective_from).toLocaleDateString()}
                    </p>
                    <button
                      className="small-link"
                      onClick={async () => {
                        try {
                          const data = await api(`/api/documents/${d.id}`);
                          setAnswer(
                            `${data.document.title}\n\n${data.document.content}`,
                          );
                          setCitations([]);
                          setSection("assistant");
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Policy unavailable.",
                          );
                        }
                      }}
                    >
                      Read policy ↗
                    </button>
                  </article>
                ))}
            </div>
            {docs.filter((d) => d.status === "published").length === 0 && (
              <div className="empty-state">
                No published policies are visible.
              </div>
            )}
          </section>
        )}
        {section === "hr" && (
          <section className="content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">REVIEWER WORKSPACE</p>
                <h1>HR request inbox</h1>
                <p>
                  Review employee requests, reply in the thread, and record each
                  status change.
                </p>
              </div>
              <span className="count-pill">{requests.length} requests</span>
            </div>
            <div className="panel inbox-panel">
              {requests.length ? (
                requests.map((r) => (
                  <article className="inbox-row" key={r.id}>
                    <div className="request-avatar">
                      {(r.requester ?? "E").slice(0, 1)}
                    </div>
                    <div className="inbox-body">
                      <div className="inbox-meta">
                        <b>{r.requester ?? "Employee"}</b>
                        <span>·</span>
                        <span>
                          {new Date(
                            r.submitted_at ?? Date.now(),
                          ).toLocaleDateString()}
                        </span>
                        <span className={`status status-${r.status}`}>
                          {r.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <h3>{r.subject}</h3>
                      <p>{r.description}</p>
                      <small>{r.category.replaceAll("_", " ")}</small>
                      <div className="request-thread">
                        <b>Conversation</b>
                        {r.events?.length ? (
                          r.events.map((event) => (
                            <div className="request-event" key={event.id}>
                              <strong>
                                {event.actor} · {event.actorRole}
                              </strong>
                              <small>
                                {new Date(event.createdAt).toLocaleString()}
                              </small>
                              {event.fromStatus !== event.toStatus && (
                                <span>
                                  Status: {event.toStatus.replaceAll("_", " ")}
                                </span>
                              )}
                              {event.note && <p>{event.note}</p>}
                            </div>
                          ))
                        ) : (
                          <p className="empty-small">No replies yet.</p>
                        )}
                      </div>
                    </div>
                    <div className="status-actions">
                      <label>
                        Reply or status update
                        <textarea
                          value={requestNotes[r.id] ?? ""}
                          maxLength={1200}
                          onChange={(e) =>
                            setRequestNotes({
                              ...requestNotes,
                              [r.id]: e.target.value,
                            })
                          }
                          placeholder="Write the response the employee will see."
                        />
                      </label>
                      <button
                        disabled={(requestNotes[r.id] ?? "").trim().length < 2}
                        onClick={() => void replyToRequest(r.id)}
                      >
                        Send reply
                      </button>
                      {r.status === "submitted" && (
                        <button
                          disabled={
                            (requestNotes[r.id] ?? "").trim().length < 2
                          }
                          onClick={() => updateStatus(r.id, "in_review")}
                        >
                          Start review
                        </button>
                      )}
                      {r.status === "in_review" && (
                        <>
                          <button
                            disabled={
                              (requestNotes[r.id] ?? "").trim().length < 2
                            }
                            onClick={() =>
                              updateStatus(r.id, "waiting_on_employee")
                            }
                          >
                            Need info
                          </button>
                          <button
                            disabled={
                              (requestNotes[r.id] ?? "").trim().length < 2
                            }
                            onClick={() => updateStatus(r.id, "resolved")}
                          >
                            Resolve
                          </button>
                        </>
                      )}
                      {r.status === "waiting_on_employee" && (
                        <button
                          disabled={
                            (requestNotes[r.id] ?? "").trim().length < 2
                          }
                          onClick={() => updateStatus(r.id, "in_review")}
                        >
                          Resume review
                        </button>
                      )}
                      {r.status === "resolved" && (
                        <button
                          disabled={
                            (requestNotes[r.id] ?? "").trim().length < 2
                          }
                          onClick={() => updateStatus(r.id, "closed")}
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <span>◷</span>
                  <b>Inbox is clear</b>
                  <p>
                    Submitted employee requests appear here for human review.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
        {section === "admin" && user.role === "admin" && (
          <section className="content">
            <div className="page-heading">
              <div>
                <p className="eyebrow">POLICY OPERATIONS</p>
                <h1>Admin studio</h1>
                <p>
                  Preview and publish policy files, and inspect workspace
                  totals.
                </p>
              </div>
            </div>
            <div className="admin-grid">
              <form className="panel form-panel" onSubmit={uploadPolicy}>
                <div className="panel-heading">
                  <span className="panel-icon">＋</span>
                  <div>
                    <h2>Add a policy version</h2>
                    <p>Text and Markdown files, up to 10 MB.</p>
                  </div>
                </div>
                <label>
                  Display title
                  <input
                    value={policyTitle}
                    onChange={(e) => setPolicyTitle(e.target.value)}
                    maxLength={160}
                    placeholder="e.g. Northstar Holiday Calendar"
                  />
                </label>
                <label>
                  Policy type
                  <select
                    value={policyType}
                    onChange={(e) => setPolicyType(e.target.value)}
                  >
                    <option value="general">General</option>
                    <option value="leave">Leave</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="relocation">Relocation</option>
                    <option value="expenses">Expenses</option>
                    <option value="remote_work">Remote work</option>
                    <option value="benefits">Benefits</option>
                  </select>
                </label>
                <label>
                  Audience
                  <select
                    value={policyAudience}
                    onChange={(e) => setPolicyAudience(e.target.value)}
                  >
                    <option value="all">Everyone</option>
                    <option value="employee">Employees</option>
                    <option value="hr">HR reviewers</option>
                    <option value="admin">Policy admins</option>
                  </select>
                </label>
                <label>
                  Effective from
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Effective through (optional)
                  <input
                    type="date"
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    min={effectiveFrom}
                  />
                </label>
                <label>
                  Policy file
                  <input
                    type="file"
                    accept=".md,.txt,text/plain,text/markdown"
                    onChange={(e) => setPolicyFile(e.target.files?.[0] ?? null)}
                    required
                  />
                </label>
                <div className="form-warning">
                  Review extracted text before publishing. Use fictional content
                  only.
                </div>
                <button className="primary" disabled={busy || !policyFile}>
                  {busy ? "Processing…" : "Upload & preview"}
                </button>
              </form>
              <div className="panel list-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Policy versions</h2>
                    <p>
                      {docs.length} documents ·{" "}
                      {appMode === "live"
                        ? "live embeddings"
                        : "lexical demo search"}
                    </p>
                  </div>
                </div>
                {docs.map((d) => (
                  <div className="request-row" key={d.id}>
                    <div>
                      <span className={`status status-${d.status}`}>
                        {d.status}
                      </span>
                      <h3>{d.title}</h3>
                      <p>
                        {d.chunk_count} chunks · v{d.version_label}
                      </p>
                    </div>
                    {
                      <>
                        {(d.status === "failed" ||
                          (d.status === "published" && appMode === "live")) && (
                          <button
                            className="small-link"
                            onClick={async () => {
                              try {
                                await api(`/api/documents/${d.id}/ingest`, {
                                  method: "POST",
                                  body: "{}",
                                });
                                await refresh(user!);
                                setError("Policy indexing completed.");
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Indexing retry failed.",
                                );
                              }
                            }}
                          >
                            {d.status === "failed"
                              ? "Retry indexing"
                              : "Re-index embeddings"}
                          </button>
                        )}
                        <button
                          className="small-link"
                          onClick={async () => {
                            try {
                              const preview = await api(
                                `/api/documents/${d.id}`,
                              );
                              setPreviewDocId(d.id);
                              setPreviewChunks(
                                (preview.chunks ?? []).map(
                                  (chunk: { content: string }) => chunk.content,
                                ),
                              );
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Preview unavailable.",
                              );
                            }
                          }}
                        >
                          Preview
                        </button>
                        {d.status === "draft" && previewDocId === d.id && (
                          <button
                            className="small-link"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `Publish “${d.title}” after reviewing the extracted passages?`,
                                )
                              )
                                return;
                              try {
                                await api(`/api/documents/${d.id}/publish`, {
                                  method: "POST",
                                  body: "{}",
                                });
                                await refresh(user!);
                                setError("Policy published.");
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Publish failed.",
                                );
                              }
                            }}
                          >
                            Publish
                          </button>
                        )}
                        {d.status === "published" && (
                          <button
                            className="small-link"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `Archive “${d.title}” version ${d.version_label}? Past citations will remain in the conversation record.`,
                                )
                              )
                                return;
                              try {
                                await api(`/api/documents/${d.id}/archive`, {
                                  method: "POST",
                                  body: "{}",
                                });
                                await refresh(user!);
                                setError("Policy version archived.");
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Archive failed.",
                                );
                              }
                            }}
                          >
                            Archive
                          </button>
                        )}
                      </>
                    }
                  </div>
                ))}
              </div>
            </div>
            {previewChunks.length > 0 && (
              <div className="panel preview-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Extraction preview</h2>
                    <p>Review these text chunks before publishing.</p>
                  </div>
                </div>
                {previewChunks.map((chunk, index) => (
                  <p key={index} className="preview-text">
                    {chunk}
                  </p>
                ))}
              </div>
            )}
            <div className="metric-row">
              <Metric title="Answers" value={metrics?.answers} />
              <Metric title="Request states" value={metrics?.requests} />
              <Metric title="Feedback" value={metrics?.feedback} />
              <Metric title="Workspace mode" value={metrics?.mode} />
            </div>
            <p className="scope-footnote">
              These counts describe this demo database only. They are not an AI
              quality evaluation.
            </p>
          </section>
        )}
        <footer className="footer">
          <span>
            PeopleOps Copilot <i>·</i> Portfolio prototype
          </span>
          <a href="#scope">Privacy & scope</a>
          <span>Built for humans, with humans.</span>
        </footer>
      </main>
    </div>
  );
}
function Metric({ title, value }: { title: string; value: unknown }) {
  const rows = Array.isArray(value)
    ? (value as {
        status?: string;
        answer_status?: string;
        rating?: string;
        count: number;
      }[])
    : [];
  return (
    <article className="metric-card">
      <small>{title}</small>
      <b>
        {rows.length
          ? rows.reduce((sum, row) => sum + Number(row.count), 0)
          : typeof value === "string"
            ? value
            : "—"}
      </b>
      <p>
        {rows
          .map((r) => `${r.status ?? r.answer_status ?? r.rating} ${r.count}`)
          .join(" · ") || "No activity yet"}
      </p>
    </article>
  );
}
