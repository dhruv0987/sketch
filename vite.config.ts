import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // CRITICAL: Check both the loaded env object AND the system process.env.
  // We also check for VITE_API_KEY as a fallback convenience.
  const apiKey = env.API_KEY || process.env.API_KEY || env.VITE_API_KEY || process.env.VITE_API_KEY || '';

  if (!apiKey) {
    console.warn("⚠️  WARNING: API_KEY is missing in the build environment. The app will not function correctly.");
  }

  return {
    plugins: [react()],
    define: {
      // This maps the Vercel/System Env Var 'API_KEY' to 'process.env.API_KEY' in the browser code
      // We stringify explicitly to ensure a valid string is always inserted, even if empty.
      'process.env.API_KEY': JSON.stringify(apiKey)
    }
  };
});