export function validateProviderManifest(provider) {
  const errors = [];
  const source = provider && typeof provider === "object" ? provider : {};

  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u.test(String(source.id || ""))) {
    errors.push("provider id must use lowercase letters, numbers, and hyphens");
  }
  if (!String(source.name || "").trim()) {
    errors.push("provider name is required");
  }
  if (typeof source.deploy !== "function") {
    errors.push("provider deploy function is required");
  }

  return { ok: errors.length === 0, errors };
}

export function createProviderRegistry(providers = []) {
  const registry = new Map();
  for (const provider of providers) {
    const validation = validateProviderManifest(provider);
    if (!validation.ok) {
      throw new Error(`Invalid SnailLift provider: ${validation.errors.join("; ")}`);
    }
    registry.set(provider.id, provider);
  }
  return registry;
}
