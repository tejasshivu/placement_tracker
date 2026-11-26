const DEFAULT_DOMAINS = "college.edu";

export function collegeEmailDomains() {
  const raw = import.meta.env.VITE_COLLEGE_EMAIL_DOMAINS || DEFAULT_DOMAINS;
  return String(raw)
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** @returns {{ ok: true, email: string } | { ok: false, error: string }} */
export function parseCollegeEmail(email) {
  const text = String(email || "").trim().toLowerCase();
  if (!text.includes("@")) {
    return { ok: false, error: "Use your college email address" };
  }
  const domain = text.split("@").pop();
  const allowed = collegeEmailDomains();
  if (!allowed.includes(domain)) {
    if (allowed.length === 1) {
      return { ok: false, error: `Students must register with a @${allowed[0]} email` };
    }
    const listed = allowed.map((d) => `@${d}`).join(", ");
    return { ok: false, error: `Students must register with a college email (${listed})` };
  }
  return { ok: true, email: text };
}

export function collegeEmailHint() {
  const allowed = collegeEmailDomains();
  if (allowed.length === 1) return `Use your @${allowed[0]} college email`;
  return `Use a college email (${allowed.map((d) => `@${d}`).join(", ")})`;
}
