import { createApp } from 'vue'
import './index.css'
import App from './App.vue'
import Varlet from '@varlet/ui'
import '@varlet/ui/es/style'
import '@varlet/touch-emulator'
import router from './router';
const app = createApp(App);
app.use(Varlet)
app.use(router);
app.mount('#app')
