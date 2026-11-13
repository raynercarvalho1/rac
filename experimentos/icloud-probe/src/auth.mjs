export function bearerTokenMatches(header, expected) {
  if (typeof header !== "string" || typeof expected !== "string" || expected.length < 32) return false;
  if (header.slice(0, 7) !== "Bearer ") return false;

  const candidate = header.slice(7);
  let difference = candidate.length ^ expected.length;
  const length = Math.max(candidate.length, expected.length);
  for (let i = 0; i < length; i += 1) {
    difference |= (candidate.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return difference === 0;
}
