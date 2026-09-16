import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const conflictMarker = /^(<<<<<<<|=======|>>>>>>>)(?: .*)?$/;
const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const conflicts = [];

for (const file of trackedFiles) {
  let contents;

  try {
    contents = readFileSync(file, "utf8");
  } catch {
    // Git can track files that are not readable in the current checkout.
    continue;
  }

  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (conflictMarker.test(line)) {
      conflicts.push(`${file}:${index + 1}: ${line}`);
    }
  }
}

if (conflicts.length > 0) {
  console.error("Unresolved merge conflict markers found:");
  for (const conflict of conflicts) {
    console.error(`  ${conflict}`);
  }
  console.error("Resolve these markers before running typecheck or build.");
  process.exit(1);
}

console.log(
  `Conflict marker check passed (${trackedFiles.length} tracked files scanned).`,
);
