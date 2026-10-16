// Pure entitlement rules matching js/usage.js. No secrets. No network.
function entitled(u, now) {
  if (!u) return false;
  if (u.subscriptionStatus === "active" && u.subscriptionExpiresAt && now < new Date(u.subscriptionExpiresAt).getTime()) return true;
  if (u.trialEndsAt && now < new Date(u.trialEndsAt).getTime()) return true;
  return false;
}
function daysLeft(u, now) {
  if (!u || !u.trialEndsAt) return null;
  return Math.ceil((new Date(u.trialEndsAt).getTime() - now) / 86400000);
}
function canPersist(u) {
  if (!u || !u.entitlementChecked) return true;
  return entitled(u, Date.now());
}

var now = Date.parse("2026-10-16T00:00:00Z");
var fails = 0;
function check(name, cond) {
  if (!cond) { fails++; console.error("FAIL", name); }
  else console.log("PASS", name);
}
check("active trial", entitled({ trialEndsAt: "2026-10-30T00:00:00Z" }, now));
check("expired trial", !entitled({ trialEndsAt: "2026-10-01T00:00:00Z" }, now));
check("active sub", entitled({ subscriptionStatus: "active", subscriptionExpiresAt: "2026-11-01T00:00:00Z" }, now));
check("expired sub", !entitled({ subscriptionStatus: "active", subscriptionExpiresAt: "2026-10-01T00:00:00Z" }, now));
check("missing dates not entitled", !entitled({ entitlementChecked: true }, now));
check("unchecked does not block yet", canPersist({ entitlementChecked: false }));
check("checked missing blocks", !canPersist({ entitlementChecked: true }));
check("three day warning", daysLeft({ trialEndsAt: "2026-10-19T00:00:00Z" }, now) === 3);
check("refresh does not restart", entitled({ trialEndsAt: "2026-10-01T00:00:00Z" }, now) === false);
if (fails) { console.error(fails + " failed"); process.exit(1); }
console.log("trial rules passed");
