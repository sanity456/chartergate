import { DEPLOYMENT } from "../lib/deployment.ts";
if (DEPLOYMENT.policy === "chartergate/rules-v2") {
  process.argv.push("--public");
  await import("./v2-checks.mjs");
} else {
  await import("./check-submission-v1.mjs");
}
