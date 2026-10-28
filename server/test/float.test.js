const test = require("node:test");
const assert = require("node:assert/strict");

const { getFloatWarnings } = require("../src/float");

const now = Date.parse("2026-10-28T14:00:00Z");
const options = { minFreeFloatPercent: 10, maxFloatAgeDays: 90, now };

test("returns no warnings for recent float data with a normal free-float percent", () => {
  const warnings = getFloatWarnings(
    { freeFloatPercent: 65, floatEffectiveDate: "2026-10-01" },
    options,
  );

  assert.deepEqual(warnings, []);
});

test("flags a free-float percent below the minimum", () => {
  const warnings = getFloatWarnings(
    { freeFloatPercent: 4, floatEffectiveDate: "2026-10-01" },
    options,
  );

  assert.deepEqual(warnings, ["Free float is only 4% of shares"]);
});

test("flags float data older than the maximum age", () => {
  const warnings = getFloatWarnings(
    { freeFloatPercent: 65, floatEffectiveDate: "2026-06-30" },
    options,
  );

  assert.deepEqual(warnings, ["Float data is 120 days old"]);
});

test("flags missing free-float percent and effective date", () => {
  const warnings = getFloatWarnings({}, options);

  assert.deepEqual(warnings, [
    "Free float percent is missing",
    "Float effective date is missing",
  ]);
});

test("does not flag values exactly at the thresholds", () => {
  const warnings = getFloatWarnings(
    { freeFloatPercent: 10, floatEffectiveDate: "2026-07-30" },
    options,
  );

  assert.deepEqual(warnings, []);
});
