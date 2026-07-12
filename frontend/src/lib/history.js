// Tiny client-side "travel history": the places a user has opened, kept in
// localStorage. Powers a "Recently viewed" rail and lightweight personalization —
// no account, no server, nothing leaves the browser.

const KEY = "atlas.recent";
const MAX = 10;

export function loadRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

// Prepend a destination name (de-duplicated, most-recent-first). Returns the new list.
export function pushRecent(name) {
  if (!name) return loadRecent();
  const next = [name, ...loadRecent().filter((n) => n !== name)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private-mode errors */
  }
  return next;
}
