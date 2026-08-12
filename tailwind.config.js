/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#111827',
          900: '#FFFFFF',
          800: '#F8FAFC',
          700: '#E5E7EB',
          600: '#6B7280',
        },
        cream: {
          DEFAULT: '#111827',
          soft: '#374151',
        },
        charo: {
          orange: '#FF5A1F',
          orange2: '#FF8A3D',
          amber: '#FFB020',
        },
        live: '#EF4444',
      },
      fontFamily: {
        display: ['"Inter"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'charo-gradient': 'linear-gradient(135deg, #FF5A1F 0%, #FF8A3D 55%, #FFB020 100%)',
        'radial-glow': 'radial-gradient(circle at 50% 0%, rgba(255,90,31,0.08), transparent 55%)',
      },
      boxShadow: {
        glow: '0 0 30px rgba(255,90,31,0.18)',
        card: '0 8px 30px rgba(15,23,42,0.08)',
      },
    },
  },
  plugins: [],
}
