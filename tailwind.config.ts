import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rpa: {
          green: "#00A050",
          "green-dark": "#007038",
          yellow: "#F0F000",
        },
        gunmetal: "#1A1B1D",
        mist: "#F7F4EC",
        canvas: "#F3F0E8",
        sunken: "#F7F4EC",
        status: {
          licensed: "#00A050",
          progress: "#B8860B",
          stalled: "#A8362B",
          info: "#2C5D7A",
        },
      },
      fontFamily: {
        sans: ["Arial", '"Helvetica Neue"', "Helvetica", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        chip: "999px",
      },
      letterSpacing: {
        caps: "0.06em",
      },
    },
  },
  plugins: [],
};

export default config;
