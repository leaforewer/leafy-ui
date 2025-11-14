import fs from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import { defineConfig } from "tsup";

async function copyCSSFiles() {
  const cssFiles = globSync("src/**/*.css");
  await Promise.all(
    cssFiles.map(async (file) => {
      const dest = path.resolve("dist", path.relative("src", file));
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(file, dest);
    }),
  );
  console.log(`✅ Copied ${cssFiles.length} CSS files to dist/`);
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    ...Object.fromEntries(
      globSync("src/components/**/*.ts").map((file) => [
        path.relative("src", file).replace(/\.ts$/, ""),
        file,
      ]),
    ),
    ...Object.fromEntries(
      globSync("src/utils/**/*.ts").map((file) => [
        path.relative("src", file).replace(/\.ts$/, ""),
        file,
      ]),
    ),
  },
  outDir: "dist",
  clean: true,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  splitting: false,
  treeshake: false,
  async onSuccess() {
    await copyCSSFiles();
  },
});
