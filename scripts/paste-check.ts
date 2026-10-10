// Run: npx tsx scripts/paste-check.ts — self-check for the Excel paste parsers.
import assert from "node:assert";
import { parseDay, parsePaste, parseSize } from "../src/app/dashboard/shared";

assert.equal(parseDay("2026-10-09"), "2026-10-09");
assert.equal(parseDay("09/10/2026"), "2026-10-09");
assert.equal(parseDay("9-10-26"), "2026-10-09");
assert.equal(parseDay("09.10.2026"), "2026-10-09");
assert.equal(parseDay("9-Oct-2026"), "2026-10-09");
assert.equal(parseDay("9 Oct 26"), "2026-10-09");
assert.equal(parseDay("13/13/2026"), "");
assert.equal(parseDay("garbage"), "");
assert.equal(parseSize("40ft"), 40);
assert.equal(parseSize("20'"), 20);
assert.equal(parseSize(""), null);
assert.deepEqual(
  parsePaste("Date\tDriver\tContainer\r\n09/10/2026\tRamesh\tMSMU8095631\r\n\r\n10/10/2026\t\tTGHU1234567\r\n"),
  [["09/10/2026", "Ramesh", "MSMU8095631"], ["10/10/2026", "", "TGHU1234567"]],
);
console.log("paste parsers ok");
