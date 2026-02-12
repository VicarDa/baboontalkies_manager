import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path';
const proxy = {
  "/wechat": {
    target: "https://baboontalkies-backend-627990150052.asia-southeast1.run.app",
    changeOrigin: true,
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: process.env.NODE_ENV === 'production' ? '/checkin/' : '/',
  server: {
    port: 7799,
    proxy,
    hmr: {
      overlay: true
    }
  },
  build: {
    rollupOptions: {
      input: {
        'index': resolve(__dirname, 'index.html'),
      }
    }
  }
})
