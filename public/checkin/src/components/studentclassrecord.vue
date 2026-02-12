<template>
  <div class="container bg-gray-50 shadow-sm">
    <!-- 添加 flex 布局类 -->
    <div class="flex flex-col shadow-sm">
      <!-- 课程时间显示 -->
      <div class="header p-4 rounded-md text-center">
        <div class="course-time text-lg font-semibold">
          Last Lesson for {{ student?.studentName }}
        </div>
        <div class="course-time text-lg font-semibold">
          {{
            dayjs(studentclassrecord?.classBtime * 1000).format("MM-DD HH:mm")
          }}
        </div>
      </div>

      <div class="section bg-white p-4 rounded-md">
        <div
          class="border-my section-title text-xl font-semibold text-gray-700 mb-2"
        >
          Feedback:
        </div>
        <pre
          v-if="studentclassrecord?.classFeedback"
          id="feedback"
          class="w-full p-2 border rounded-md whitespace-pre-wrap"
          v-text="classFeedback(studentclassrecord)"
        ></pre>
      </div>

      <!-- 课程教材内容 -->
      <div
        class="section bg-white p-4"
        v-if="studentclassrecord.Textbook?.length > 0"
      >
        <div
          class="border-my section-title text-xl font-semibold text-gray-700 mb-2"
        >
          Material:
        </div>
        <div class="material-list grid grid-cols-1 gap-4">
          <text
            class="text-blue-600 hover:underline text-sm"
            v-for="v in unionBy(studentclassrecord.Textbook, (e:any) => e.title)"
          >
            {{ v.title }}
          </text>
        </div>
      </div>

      <!-- 上课屏幕截图 -->
      <div
        class="section bg-white p-4"
        v-if="studentclassrecord.blackboardImage?.length && index === 0"
      >
        <div
          class="border-my section-title text-xl font-semibold text-gray-700 mb-4"
        >
          Screen Record:
        </div>
        <div class="image-list grid grid-cols-1 gap-4">
          <video
            v-for="v in studentclassrecord?.classRecord.VodInfo.FileList"
            controls
            class="w-full rounded-md mb-2"
          >
            <source :src="v.Playset[0].Url" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>

        <div class="image-list grid grid-cols-2 gap-4">
          <var-image
            v-for="v in studentclassrecord.blackboardImage"
            :src="v.picUrl"
            :key="v"
            class="screenshot w-full h-auto rounded-lg shadow"
            @click="previewImage(v.picUrl)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ImagePreview } from "@varlet/ui";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { unionBy } from "lodash-es";
dayjs.extend(relativeTime);

const props = defineProps<{
  studentclassrecord: any;
  index: number;
  student: any;
  classFeedback: Function;
}>();

function previewImage(image: string) {
  const blackboardImage = Array.isArray(
    props.studentclassrecord.blackboardImage
  );
  const list = blackboardImage ? props.studentclassrecord.blackboardImage : [];
  const index = list.findIndex((v: any) => v.picUrl === image);
  ImagePreview({
    initialIndex: index,
    images: list.map((v: any) => v.picUrl),
    onChange(index) {
      console.log(index);
    },
  });
}
</script>

<style scoped lang="scss"></style>
