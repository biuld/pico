const roots = ["src", "tests"];
const files = (
  await Promise.all(
    roots.map(async (root) => {
      const paths: string[] = [];
      for await (const path of new Bun.Glob(`${root}/**/*.ts`).scan(".")) {
        paths.push(path);
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
