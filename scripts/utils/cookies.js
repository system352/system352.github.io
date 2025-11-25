export function setCookie(name, value, days = 7) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getCookie(name) {
  const cookies = document.cookie.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    if (!cookie) continue;
    const [key, val] = cookie.split('=');
    if (key === name) {
      return val;
    }
  }
  return null;
}

export function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}
