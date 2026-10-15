const assert = require("assert");
const crypto = require("crypto");

const PLANS = {
  monthly: { naira: 1500, kobo: 150000 },
  quarterly: { naira: 4275, kobo: 427500 },
  semi_annual: { naira: 8100, kobo: 810000 },
  annual: { naira: 15300, kobo: 1530000 }
};

assert.strictEqual(PLANS.monthly.kobo, 150000);
assert.strictEqual(PLANS.quarterly.kobo, 427500);
assert.strictEqual(PLANS.semi_annual.kobo, 810000);
assert.strictEqual(PLANS.annual.kobo, 1530000);

function sign(secret, body) {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

const body = JSON.stringify({ event: "charge.success", data: { reference: "ref-1", amount: 150000 } });
const good = sign("test-secret", body);
const bad = sign("other-secret", body);
assert.strictEqual(good, sign("test-secret", body));
assert.notStrictEqual(good, bad);
assert.notStrictEqual(sign("test-secret", body + " "), good);

console.log("billing plan and signature checks passed");
