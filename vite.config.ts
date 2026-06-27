export default {
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/monaco-editor")) {
            return "monaco-editor";
          }

          if (id.includes("node_modules/@monaco-editor")) {
            return "monaco-editor";
          }

          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }

          if (id.includes("node_modules/lucide-react")) {
            return "ui-icons";
          }

          if (id.includes("node_modules")) {
            return "vendor";
          }
        }
      },
      onwarn(warning, warn) {
        const ignoredLucideDirective =
          warning.code === "MODULE_LEVEL_DIRECTIVE" &&
          typeof warning.id === "string" &&
          warning.id.includes("node_modules/lucide-react");

        if (ignoredLucideDirective) {
          return;
        }

        warn(warning);
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: process.env.CODEREADER_WINDOWS_ROOT
      ? {
          usePolling: true,
          interval: 300
        }
      : undefined
  },
  envPrefix: ["VITE_", "TAURI_"]
};
