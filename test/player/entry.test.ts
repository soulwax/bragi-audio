import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const playerDir = join(import.meta.dirname, "../../src/player");

describe("bragi-audio/player entry", () => {
  it("imports only its own modules, so browser bundles never pull in Node or the parser", () => {
    const specifiers = readdirSync(playerDir)
      .filter((name) => name.endsWith(".ts"))
      .flatMap((name) =>
        [
          ...readFileSync(join(playerDir, name), "utf8").matchAll(
            /\bfrom\s+"([^"]+)"/g,
          ),
        ].map((match) => match[1]),
      );

    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier).toMatch(/^\.\/[\w-]+\.js$/);
    }
  });
});
