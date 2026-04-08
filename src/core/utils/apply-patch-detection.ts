function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function hasApplyPatchPatchText(rawInput: unknown): boolean {
  const input = asRecord(rawInput);
  return !!input && (typeof input.patchText === "string" || typeof input.patch_text === "string");
}

export function isApplyPatchOtherTool(kind: string | undefined, name: string, rawInput: unknown): boolean {
  if (kind !== "other") return false;
  if (name.toLowerCase() === "apply_patch") return true;
  return hasApplyPatchPatchText(rawInput);
}
