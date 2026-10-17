const assert = require("assert");

function trialEndFrom(data) {
  if (!data) return "";
  return data.trial_ends_at || data.trialEndsAt || "";
}

function formatTrialDate(value) {
  const date = new Date(value);
  if (!value || isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

assert.strictEqual(trialEndFrom({ trial_ends_at: "2026-10-31T12:00:00Z" }), "2026-10-31T12:00:00Z");
assert.strictEqual(trialEndFrom({ trialEndsAt: "2026-11-01T12:00:00Z" }), "2026-11-01T12:00:00Z");
assert.strictEqual(trialEndFrom({}), "");
assert.ok(formatTrialDate("2026-10-31T12:00:00Z").includes("2026"));
assert.strictEqual(formatTrialDate(""), "");
assert.strictEqual(formatTrialDate("not-a-date"), "");

const end = Date.now() + (3 * 86400000) + 5000;
const diff = end - Date.now();
assert.ok(diff <= 3 * 86400000 + 5000);
assert.ok(Math.floor(diff / 86400000) >= 2);

console.log("trial display checks passed");
