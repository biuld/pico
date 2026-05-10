import solidPlugin from "@opentui/solid/bun-plugin";

const compile = Bun.argv.includes("--compile");
const outdir = argValue("--outdir") || "dist";
const outfile = argValue("--outfile") || (compile ? "pico" : undefined);

const config: Parameters<typeof Bun.build>[0] = {
  entrypoints: ["./src/index.ts"],
  target: "bun",
  format: "esm",
  plugins: [solidPlugin],
};

if (compile) {
  (config as Record<string, unknown>).compile = {
    outfile,
    autoloadBunfig: false,
  };
} else {
  config.outdir = outdir;
}

const result = await Bun.build(config);

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

function argValue(name: string): string | undefined {
  const equalsPrefix = `${name}=`;
  for (let index = 0; index < Bun.argv.length; index += 1) {
    const value = Bun.argv[index];
    if (value === name) return Bun.argv[index + 1];
    if (value.startsWith(equalsPrefix)) return value.slice(equalsPrefix.length);
  }
  return undefined;
}
