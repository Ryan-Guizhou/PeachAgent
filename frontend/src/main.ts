import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './style.css'
const pages=['home','projects','models','credentials','prompts','chat','runs','usage','plugins','settings']
const router=createRouter({history:createWebHashHistory(),routes:[{path:'/',redirect:'/home'},...pages.map(p=>({path:'/'+p,name:p,component:{template:'<span />'}})),{path:'/:pathMatch(.*)*',redirect:'/home'}]})
createApp(App).use(createPinia()).use(router).mount('#app')
