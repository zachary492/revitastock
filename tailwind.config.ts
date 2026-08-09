import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "ghost-listing": "#dc2626",
        "phantom-drop": "#d97706",
        "in-sync": "#16a34a",
      },
    },
  },
  plugins: [],
};

export default config;
