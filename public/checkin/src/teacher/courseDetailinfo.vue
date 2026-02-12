<template>
  <div class="container bg-blue-100 min-h-screen pb-16">
    <var-app-bar
      :title="ClassSession?.className"
      class="bg-blue-600 text-white shadow-md rounded-md"
    >
      <template #left>
        <var-button
          color="transparent"
          text-color="#fff"
          round
          text
          @click="() => router.back()"
          class="ml-2"
        >
          <var-icon name="chevron-left" :size="24" />
        </var-button>
      </template>
    </var-app-bar>
    <!-- 添加 flex 布局类 -->
    <div v-if="ClassSession" class="flex flex-col p-4 space-y-4 shadow-sm">
      <!-- 标题栏样式优化 -->

      <!-- 课程时间显示 -->
      <div class="header p-4 text-center">
        <text class="course-time text-blue-700 text-lg font-semibold"
          >Class start at
          {{ dayjs(ClassSession?.classBtime * 1000).format("HH:mm") }} for
          {{
            Math.floor((ClassSession.classEtime - ClassSession.classBtime) / 60)
          }}
          minutes
        </text>
      </div>

      <!-- 上课笔记 -->
      <div class="section bg-white p-4 rounded-md shadow-sm">
        <div
          class="border-my section-title text-xl font-semibold text-gray-700 mb-2"
        >
          Class Note: {{ student?.courseRequire ? "" : "None" }}
        </div>
        <text class="text-blue-600">
          {{ student?.courseRequire }}
        </text>
        <div
          class="border-my section-title text-xl font-semibold text-gray-700 mb-2"
        >
          Feedback:
        </div>
        <pre
          v-if="StudentClassRecord?.classFeedback"
          id="feedback"
          class="w-full p-2 border rounded-md whitespace-pre-wrap"
          v-text="classFeedback(StudentClassRecord)"
        ></pre>
        <div class="text-center">
          <!-- Submit Button -->
          <var-button
            v-if="StudentClassRecord"
            type="primary"
            @click="
              router.push({
                name: 'feedback',
                params: { id: StudentClassRecord?.id },
                query: {
                  feedbackType: feedbackType ? 'regular' : 'trial',
                },
              })
            "
            class="mt-4 w-full"
            >{{
              StudentClassRecord.classFeedback ? "Edit Feedback" : "+ Feedback"
            }}</var-button
          >
        </div>
      </div>
      <StudentclassrecordVue
        v-for="(v, i) in StudentClassRecords"
        :key="v.id"
        :studentclassrecord="v"
        :index="i"
        :student="student"
        :classFeedback="classFeedback"
      ></StudentclassrecordVue>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import api from "../api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
// import { ImagePreview } from "@varlet/ui";
import StudentclassrecordVue from "../components/studentclassrecord.vue";
dayjs.extend(relativeTime);
const props = defineProps<{ id: string }>();
const Textbook = ref<any[]>([]);
const ClassSession = ref();
const StudentClassRecords = ref<any[]>([]);
const student = ref();
const feedbackType = computed(() => {
  if (StudentClassRecords.value.length) {
    const l = StudentClassRecords.value.filter((v) => {
      return v.teacherUid === ClassSession.value?.teacherUid;
    });
    if (l.length) {
      return "regular";
    }
  }
  return "trial";
});
const StudentClassRecord = ref();
import { useRouter } from "vue-router";
const router = useRouter();
onMounted(() => {
  start();
});

const classFeedback = (data: any) => {
  if (data.classFeedback.feedbackType === "regular") {
    const doingWellList = data.classFeedback.doingWellList
      .map((v: any, k: any) => `${k + 1}.${v.text}`)
      .join("\n");
    const needExerciseList = data.classFeedback.needExerciseList
      .map((v: any, k: any) => {
        return `${k + 1}. You said:${v.youSaid}
    Better say: ${v.betterSay}
`;
      })
      .join("\n");
    const text = `Name: ${student.value?.studentName}

KeyContent:
${data.classFeedback.keyContent}

Doing Well:
${doingWellList}

Need Exercise
${needExerciseList}
`;
    console.log(text);
    return text;
  } else {
    const text = `Name: ${student.value?.studentName}

Evaluation:
${data.classFeedback.Evaluation}

Suggestion for the next action:
${data.classFeedback.regular}
`;
    return text;
  }
};

// const FileList = (classRecord: any) => {
//   console.log(classRecord);
//   return (
//     classRecord?.VodInfo.FileList.map((v: any) =>
//       v.Playset.map((items: any) => items.Url)
//     ).flat() || []
//   );
// };

// function previewImage(image: string) {
//   const blackboardImage = Array.isArray(ClassSession.value.blackboardImage);
//   const list = blackboardImage ? ClassSession.value.blackboardImage : [];
//   const index = list.findIndex((v: any) => v.picUrl === image);
//   ImagePreview({
//     initialIndex: index,
//     images: list.map((v: any) => v.picUrl),
//     onChange(index) {
//       console.log(index);
//     },
//   });
// }

const start = async () => {
  ClassSession.value = await api<any>(
    `/wechat/classsession/info?id=${props.id}`,
    {}
  );
  Textbook.value = await api<any>(
    "/wechat/textbook/list",
    {
      classId: props.id,
    },
    "POST"
  );
  const Record = await api<any>(
    "/wechat/studentclassrecord/list",
    {
      classId: props.id,
    },
    "POST"
  );
  if (Record.length) {
    StudentClassRecord.value = Record[0];

    // 获取学生
    const _student = await api<any>(
      "/wechat/student/list",
      {
        studentUid: StudentClassRecord.value.studId,
      },
      "POST"
    );
    student.value = _student[0];

    // 获取上课记录
    const data = await api<any>(
      "/wechat/studentclassrecord/page",
      {
        studId: Record[0].studId,
        classBtime: [
          dayjs().subtract(7, "day").endOf("day").unix(),
          dayjs().endOf("day").unix(),
        ],
        size: 2,
      },
      "POST"
    );

    const Textbook = await api<any>(
      "/wechat/textbook/list",
      {
        classId: data.list.map((c: any) => c.classId),
        studId: Record[0].studId,
      },
      "POST"
    );

    StudentClassRecords.value = data.list
      .map((v: any) => {
        const textbook = Textbook.filter((t: any) => t.classId === v.classId);
        if (textbook) {
          v.Textbook = textbook;
          console.log(textbook);
        }
        return v;
      })
      .filter((v: any) => v.id !== StudentClassRecord.value.id);
  }
};

/**
 * 根据给定的 Duration 计算分钟和秒
 * @param duration - 视频时长（单位：毫秒）
 * @returns 格式化后的字符串（X 分钟 Y 秒）
 */
// function formatDuration(duration: number): string {
//   // 计算分钟和秒
//   const minutes = Math.floor(duration / 60000); // 1 分钟 = 60000 毫秒
//   const seconds = Math.floor((duration % 60000) / 1000); // 剩余的秒数

//   // 返回格式化后的字符串
//   return `${minutes} minutes  ${seconds} seconds`;
// }
</script>

<style scoped lang="scss"></style>
