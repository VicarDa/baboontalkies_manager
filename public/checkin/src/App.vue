<script setup lang="ts">
import { onMounted, ref, provide } from "vue";
import api from "./api";
import { StyleVars } from "@varlet/ui";
const styleVars = ref<StyleVars>();
const teacher = ref();
provide("teacher", teacher);
onMounted(() => {
  getteacher();
});

const getteacher = async () => {
  const url = new URL(window.location.href);
  const teacherUid = url.searchParams.get("teacherUid");
  if (!teacherUid) {
  } else {
    const t = await api<any>(
      "/wechat/teacher/list",
      { uid: teacherUid },
      "POST"
    );
    if (t.length > 0) {
      teacher.value = t[0];
      document.title = 'Checkin System: ' + t[0].name;
    }
  }
};
</script>

<template>
  <var-style-provider :style-vars="styleVars">
    <div v-if="teacher" class="page-title">Checkin System: {{ teacher.name }}</div>
    <RouterView></RouterView>
  </var-style-provider>
</template>

<style>
.page-title {
  max-width: 900px;
  margin: 12px auto 0;
  padding: 0 14px;
  color: #1d6a3c;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
</style>


