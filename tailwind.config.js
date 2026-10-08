/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        crousty: {
          bg: '#07090d',
          pink: '#FF5C97',
          'pink-dark': '#ff4081',
          cyan: '#00D2FF',
          panel: '#141921',
          tile: '#1a2029',
          'tile-dark': '#232a35',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'main-gradient':
          'radial-gradient(circle at top right, rgba(255, 92, 151, 0.15), transparent 40%), radial-gradient(circle at bottom left, rgba(0, 210, 255, 0.15), transparent 40%)',
        'glass-gradient': 'linear-gradient(180deg, rgba(20, 25, 33, 0.96), rgba(28, 34, 43, 0.98))',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease both',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
