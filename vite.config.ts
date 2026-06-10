export default {
  clearScreen: false,
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
