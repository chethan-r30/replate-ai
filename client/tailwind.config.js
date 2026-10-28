// Restrained green palette with accessible contrast and dark-mode support.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        forest: '#183e31',
        leaf: '#d7ebc4',
        cream: '#f8f7f2',
        ink: '#192d25',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
