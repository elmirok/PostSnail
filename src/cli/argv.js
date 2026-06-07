export function parseArgv(argv = []) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || String(next).startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = String(next);
    index += 1;
  }
  return { positionals, flags };
}

