// Dark-mode helpers. The .dark class on <html> flips the token layer (index.css).
export function initTheme() {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
}

export function isDark() {
  return document.documentElement.classList.contains('dark');
}

export function toggleTheme() {
  const dark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
  return dark;
}
