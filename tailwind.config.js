/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAFAFA',
        primary: '#2E7D32', // rich green
        secondary: '#81C784', // mint green
        accent: '#FFC107', // amber
        text: '#263238',
        surface: '#FFFFFF',
      },
      boxShadow: {
        soft: '0 6px 18px rgba(38,50,56,0.06)',
        elevated: '0 12px 40px rgba(38,50,56,0.08)',
        fab: '0 10px 30px rgba(46,125,50,0.18)',
      },
      borderRadius: {
        xl2: '1rem',
      },
    },
  },
  plugins: [],
};
