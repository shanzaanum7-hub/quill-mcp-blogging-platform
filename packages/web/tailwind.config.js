/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#07374B',
        'primary-hover': '#0F6D87',
        accent: '#66C9C4',
        'accent-soft': '#DBF3F5',
        sky: '#B2E2F9',
        periwinkle: '#B1B9DE',
        lavender: '#AA98C8',
        surface: '#FFFFFF',
        'soft-bg': '#F3FBFC',
      },
      boxShadow: {
        panel: '0 24px 50px -28px rgba(7,55,75,0.35)',
      },
    },
  },
  plugins: [],
};
