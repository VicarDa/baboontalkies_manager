import { createWebHashHistory, createRouter, RouteLocationNormalized } from 'vue-router'

import teacher from './teacher/index.vue'
import courseDetail from './teacher/courseDetail.vue'
import courseDetailinfo from './teacher/courseDetailinfo.vue'
import HomeView from './home.vue'
import feedback from './teacher/feedback.vue'
function toID(rote: RouteLocationNormalized): Record<string, any> {
    return {
        id: String(rote.params.id)
    }

}
const routes = [
    {
        path: '/', component: HomeView,
        redirect: {
            name: 'courseDetail'
        },
        children: [
            { path: '/teacher', component: teacher, name: 'teacher' },
            { path: '/courseDetail', component: courseDetail, name: 'courseDetail' },
            { path: '/courseDetailinfo/:id', component: courseDetailinfo, name: 'courseDetailinfo', props: toID },
            { path: '/feedback/:id', component: feedback, name: 'feedback', props: toID },
        ]
    },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})


export default router