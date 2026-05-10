const roots = ["src", "tests", "packages"];
const files = (
  await Promise.all(
    roots.map(async (root) => {
      const paths: string[] = [];
      for (const extension of ["ts", "tsx"]) {
        for await (const path of new Bun.Glob(`${root}/**/*.${extension}`).scan(".")) {
          paths.push(path);
        }
      }
      return paths;
    }),
  )
).flat().sort();

const args = [
  "tsc",
  "--noEmit",
  "--target",
  "ESNext",
  "--module",
  "ESNext",
  "--moduleResolution",
  "bundler",
  "--jsx",
  "preserve",
  "--jsxImportSource",
  "@opentui/solid",
  "--types",
  "bun",
  "--skipLibCheck",
  "--strict",
  ...files,
];

const proc = Bun.spawn(args, {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await proc.exited);
