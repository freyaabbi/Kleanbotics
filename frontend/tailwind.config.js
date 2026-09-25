// Token colors reference CSS variables (R G B channels) so utilities support
// alpha (bg-accent/25) AND flip under the .dark class. See src/index.css.
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: c('--page'),
        surface: c('--surface'),
        sunk: c('--sunk'),
        line: c('--border'),
        ink: c('--text'),
        muted: c('--muted'),
        accent: c('--accent'),
        'accent-fill': c('--accent-fill'),
        soft: c('--soft'),
        warn: c('--warn'),
        'warn-soft': c('--warn-soft'),
        danger: c('--danger'),
        'danger-soft': c('--danger-soft'),
        info: c('--info'),
      },
      boxShadow: {
        elev: '0 1px 2px rgba(15,23,42,.04)',
      },
      letterSpacing: {
        micro: '.08em',
      },
    },
  },
  plugins: [],
}
