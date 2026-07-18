// Sanitises a user-supplied search value before it is interpolated into a
// PostgREST `.or(...)` / `.ilike(...)` filter string. Without this a value
// containing a comma injects an extra OR condition (e.g. `x,is_active.eq.false`),
// and parens/quotes can further manipulate the filter. We strip the structural
// metacharacters; ilike wildcards (% _) are harmless and left untouched.
export function escapeOrTerm(s: string): string {
  return String(s ?? '').replace(/[,()"\\]/g, ' ').trim();
}
