import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        navy: "#002B5C",
        blue: "#234A70",
        sky: "#42B8E0",
        teal: "#18B0C0",
        lime: "#D0D840",
        paper: "#f5f8fb",
        panel: "#ffffff",
        line: "#d8e2ea",
        fern: "#18B0C0",
        brass: "#8a8f1d",
        coral: "#c2413d"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(23, 32, 51, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
