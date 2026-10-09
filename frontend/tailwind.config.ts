import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effaf6', 100: '#d7f3e8', 200: '#b1e6d3', 300: '#7dd3b8', 400: '#46b996',
          500: '#239f7e', 600: '#17806a', 700: '#146657', 800: '#135146', 900: '#12433a',
        },
        ink: '#0f2a2a',
      },
      fontFamily: { sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
