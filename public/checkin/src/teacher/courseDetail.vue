<template>
  <view class="container h-screen overflow-y-scroll">
    <!-- 使用 h-screen 控制视图高度 -->
    <var-index-bar duration="300" class="pb-16" hide-list>
      <div v-for="item in list" :key="item.letter" class="mb-8">
        <var-index-anchor
          :index="item.letter"
          class="bg-blue-100 text-blue-700 font-bold p-2 rounded-md"
        >
          {{ item.letter }} {{ item.week }}
        </var-index-anchor>
        <div class="mt-4 space-y-2">
          <RouterLink
            :to="{ name: 'courseDetailinfo', params: { id: i.id } }"
            v-for="i in item.data"
            :key="i.id"
            v-slot="{ navigate }"
            custom
          >
            <var-cell
              class="border border-gray-300 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300"
              :title="i.title"
              :description="i.courseName"
              @click="() => navigate()"
            >
              <template #extra>
                <button
                  v-if="i.attendance === 'primary'"
                  class="text-blue-500 w-auto px-3 py-1 bg-blue-100 rounded hover:bg-blue-200 transition"
                >
                  Click to Check in
                </button>
                <button
                  v-else-if="i.attendance === 'error'"
                  class="text-red-500 w-auto px-3 py-1 bg-red-100 rounded hover:bg-red-200 transition"
                >
                  Not Checked
                </button>
                <button
                  v-else-if="i.attendance === 'success'"
                  class="text-gray-500 w-auto px-3 py-1 bg-red-100 rounded hover:bg-red-200 transition"
                >
                  Checked
                </button>
              </template>
            </var-cell>
          </RouterLink>
        </div>
      </div>
    </var-index-bar>
  </view>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, Ref, ref, watch } from "vue";
import { groupBy } from "lodash-es";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import api, { IpageDate } from "../api";
// var relativeTime = require("dayjs/plugin/relativeTime");
const _list = ref<any[]>([]);
const count = ref(0);
dayjs.extend(relativeTime);
const teacher = inject<Ref<any>>("teacher");
const list = computed(() => {
  const data = groupBy(_list.value, (item) => {
    return dayjs(item.classBtime * 1000).format("YYYY-MM-DD");
  });

  const d = Object.keys(data)
    .sort((a, b) => {
      return dayjs(a).unix() - dayjs(b).unix();
    })
    .map((key) => {
      return {
        letter: dayjs(key).format("MM-DD"),
        week: dayjs(key).format("dddd"),
        data: data[key].map((item) => {
          // 课程的开始时间
          const courseStartTime = dayjs(item.classBtime * 1000); // 转换为 dayjs 对象
          // const courseEndTime = dayjs(item.classEtime * 1000); // 课程结束时间
          const signInStart = courseStartTime.subtract(
            signInConfig.value.signInStartTime,
            "minute"
          ); // 签到开始时间
          const signInEnd = courseStartTime.add(
            signInConfig.value.signInEndTime,
            "minute"
          ); // 签到结束时间
          let attendance = "success";
          const currentTime = dayjs(); // 当前时间
          if (!item.signInTime) {
            if (currentTime.isAfter(signInEnd)) {
              attendance = "error"; // 已经过了签到时间
            } else if (currentTime.isBefore(signInStart)) {
              attendance = ""; // 还未到签到时间，不显示状态
            } else {
              attendance = "primary"; // 签到时间范围内
            }
          }
          const m = Math.floor((item.classEtime - item.classBtime) / 60); // 计算分钟差 ;
          return {
            classBtime: item.classBtime,
            title:
              dayjs(item.classBtime * 1000).format("HH:mm") +
              " " +
              `last ${m} minutes`,
            id: item.id,
            courseName: item.courseName,
            classEtime: item.classEtime,
            attendance,
          };
        }),
      };
    })

    .map((item) => {
      return {
        ...item,
        data: item.data.sort((a, b) => {
          return a.classBtime - b.classBtime;
        }),
      };
    });
  console.log(d);
  return d;
});

const signInConfig = ref({
  signInStartTime: 240, // 课前 240 分钟可签到
  signInEndTime: 20, // 课前 20 分钟结束签到
  name: "早班签到配置",
  isActive: true,
});

onMounted(() => {
  start();
});

const start = async () => {
  if (!teacher?.value) return;
  const page = await api<IpageDate<any>>(
    "/wechat/classsession/page",
    {
      size: 500,
      page: 1,
      teacherUid: teacher.value.uid,
      classBtime: [
        dayjs().startOf("day").unix(),
        dayjs().add(7, "day").endOf("day").unix(),
      ],
    },
    "POST"
  );
  if (page) {
    _list.value = page.list;
    count.value = page.pagination.total;
  }
  const _signinconfig = await api<any>(
    `/wechat/signinconfig/info?teacherUid=${teacher.value.uid}`,
    {
      teacherUid: teacher.value.uid,
    },
    "GET"
  );
  if (_signinconfig) {
    signInConfig.value = _signinconfig;
  }
};

watch(
  () => teacher?.value,
  () => {
    start();
  }
);
</script>

<style scoped></style>

<style>
.container {
  max-width: 500px;
  margin: 0 auto;
}
.container .var-cell__extra {
  flex: none !important;
}
</style>
