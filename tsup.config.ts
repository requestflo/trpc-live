import { defineConfig } from "tsup";
import { readFile, writeFile } from "node:fs/promises";

// Files that form a React Server Components client boundary and therefore need
// a "use client" directive preserved at the top of the bundle.
const CLIENT_OUTPUTS = ["dist/client/index.js", "dist/client/index.cjs"];

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "client/index": "src/client/index.ts",
    "server/index": "src/server/index.ts",
    "server/hono/index": "src/server/hono/index.ts",
    "server/redis/index": "src/server/redis/index.ts",
    "server/memory/index": "src/server/memory/index.ts",
    "shared/index": "src/shared/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: [
    "react",
    "react-dom",
    "@trpc/client",
    "@trpc/react-query",
    "@trpc/server",
    "@tanstack/react-query",
    "hono",
    "ioredis",
  ],
  // esbuild strips directive prologues, so re-add "use client" to the client
  // bundle for Next.js App Router / RSC compatibility.
  async onSuccess() {
    for (const file of CLIENT_OUTPUTS) {
      const content = await readFile(file, "utf8");
      if (!content.startsWith('"use client"')) {
        await writeFile(file, `"use client";\n${content}`);
      }
    }
  },
});
