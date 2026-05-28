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
        card: "14px",
        chip: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,27,29,0.04), 0 4px 16px rgba(26,27,29,0.06)",
        "card-hover":
          "0 2px 4px rgba(26,27,29,0.06), 0 8px 24px rgba(26,27,29,0.10)",
      },
      backgroundImage: {
        "dot-grid":
          "radial-gradient(rgba(26,27,29,0.06) 1px, transparent 1px)",
      },
      backgroundSize: {
        "dot-grid": "18px 18px",
      },
      letterSpacing: {
        caps: "0.06em",
      },
    },
  },
  plugins: [],
};

export default config;
