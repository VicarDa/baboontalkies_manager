<template>
  <div class="container"></div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

onMounted(() => {
  start();
});

const start = async () => {};
</script>

<style scoped>
.container {
  padding: 20rpx;
}

.date-section {
  margin-bottom: 20rpx;
}

.date-item {
  font-size: 28rpx;
  font-weight: bold;
  margin-bottom: 10rpx;
}

.course-item {
  display: flex;
  align-items: center;
  margin-bottom: 10rpx;
}

.time,
.name,
.duration {
  margin-right: 20rpx;
  font-size: 24rpx;
}

.button {
  margin-left: auto;
  padding: 10rpx 20rpx;
  border-radius: 10rpx;
}

.button.active {
  background-color: #1890ff;
  color: #ffffff;
}

.button.expired {
  background-color: #ff4d4f;
  color: #ffffff;
}

.footer {
  margin-top: 30rpx;
  text-align: center;
}

.show-more {
  font-size: 26rpx;
  color: #f5222d;
  margin-bottom: 10rpx;
}

.footer-title {
  font-size: 30rpx;
  font-weight: bold;
}
</style>
