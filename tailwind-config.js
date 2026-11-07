/* Shared Tailwind theme (loaded right after the Tailwind CDN script) */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fbf7f2", 100: "#f3e9dc", 200: "#e6d0b5", 300: "#d4b08a", 400: "#bf8d5e",
          500: "#a8703f", 600: "#8f5a31", 700: "#724628", 800: "#5e3b25", 900: "#3f2616"
        }
      },
      fontFamily: {
        display: ["'Playfair Display'", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"]
      }
    }
  }
};
