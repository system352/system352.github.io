export async function hashText(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
