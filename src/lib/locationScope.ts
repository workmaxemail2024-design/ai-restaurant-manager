/** A remembered/selected location is kept only if it is one of the user's authorised locations. */
export function resolveAuthorisedLocation(
  candidate: string | null | undefined,
  authorisedIds: readonly string[] | null | undefined,
): string | null {
  if (!candidate) return null;
  if (!authorisedIds) return candidate; // not loaded yet — decide once loaded
  return authorisedIds.includes(candidate) ? candidate : null;
}
