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
      document.title = t[0].name;
    }
  }
};
</script>

<template>
  <var-style-provider  :style-vars="styleVars">
    <RouterView></RouterView>
  </var-style-provider>
</template>


