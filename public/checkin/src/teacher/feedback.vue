<template>
  <div>
    <var-app-bar
      title="feeback"
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
    <div class="p-4 w-full max-w-lg mx-auto">
      <!-- Feedback Type -->
      <h2 class="text-xl font-bold mb-4">Feedback</h2>
      <var-radio-group
        v-model="feedbackType"
        direction="horizontal"
        class="mb-4"
      >
        <var-radio checked-value="trial">Trial Class</var-radio>
        <var-radio checked-value="regular">Regular Class</var-radio>
      </var-radio-group>

      <!-- Key Content -->
      <div class="mb-4" v-if="feedbackType === 'regular'">
        <h3 class="font-semibold mb-2">Key Content</h3>
        <textarea
          v-model="keyContent"
          class="w-full p-2 border rounded"
        ></textarea>
      </div>

      <!-- Doing Well Section -->
      <div class="mb-4" v-if="feedbackType === 'regular'">
        <h3 class="font-semibold mb-2">Doing well</h3>
        <div
          v-for="(item, index) in doingWellList"
          :key="index"
          class="mb-2 flex items-center"
        >
          <input
            v-model="item.text"
            class="w-full p-2 border rounded mr-2"
            placeholder="Doing well content"
          />
          <var-button
            type="danger"
            round
            icon-container
            @click="removeDoingWell(index)"
            class="ml-2"
          >
            <var-icon name="delete" />
          </var-button>
        </div>
        <var-button type="primary" @click="addDoingWell" class="mt-2"
          >+ Item</var-button
        >
      </div>

      <!-- Need Exercise Section -->
      <div class="mb-4" v-if="feedbackType === 'regular'">
        <h3 class="font-semibold mb-2">Need Exercise</h3>
        <div
          v-for="(exercise, index) in needExerciseList"
          :key="index"
          class="mb-2"
        >
          <div class="flex items-center">
            <div class="w-full">
              <label class="block mb-1">You said:</label>
              <input
                v-model="exercise.youSaid"
                class="w-full p-2 border rounded mb-2"
              />
            </div>
          </div>
          <div class="flex items-end">
            <div class="w-full">
              <label class="block mb-1">Better say:</label>
              <input
                v-model="exercise.betterSay"
                class="w-full p-2 border rounded"
              />
            </div>
            <var-button
              type="danger"
              @click="removeNeedExercise(index)"
              class="ml-2"
              round
              icon-container
            >
              <var-icon name="delete"
            /></var-button>
          </div>
        </div>
        <var-button type="primary" @click="addNeedExercise" class="mt-2"
          >+ Item</var-button
        >
      </div>

      <div class="mb-4" v-if="feedbackType === 'trial'">
        <h3 class="font-semibold mb-2">Evaluation</h3>
        <textarea
          v-model="Evaluation"
          class="w-full p-2 border rounded"
        ></textarea>
      </div>

      <div class="mb-4" v-if="feedbackType === 'trial'">
        <h3 class="font-semibold mb-2">Suggestion for the next action</h3>
        <textarea
          v-model="regular"
          class="w-full p-2 border rounded"
        ></textarea>
      </div>

      <!-- Submit Button -->
      <var-button type="primary" @click="submitFeedback" class="mt-4 w-full"
        >Submit</var-button
      >
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from "vue";
import api from "../api";
import router from "../router";
import { useRoute } from "vue-router";

const feedbackType = ref<"trial" | "regular">("regular");
const keyContent = ref("");
const Evaluation = ref("");
const regular = ref("");
const doingWellList = ref([{ text: "" }]);
const needExerciseList = ref([{ youSaid: "", betterSay: "" }]);
const props = defineProps<{ id: string }>();
const addDoingWell = () => doingWellList.value.push({ text: "" });

const route = useRoute();

onMounted(() => {
  start();
});

const start = async () => {
  const data = await api<any>(
    "/wechat/studentclassrecord/info?id=" + props.id,
    {},
    "GET"
  );
  if (data) {
    feedbackType.value =
      data.classFeedback?.feedbackType || route.query.feedbackType || "regular";
    keyContent.value = data.classFeedback?.keyContent || "";
    doingWellList.value = data.classFeedback?.doingWellList || [];
    needExerciseList.value = data.classFeedback?.needExerciseList || [];
    regular.value = data.classFeedback?.regular || "";
    Evaluation.value = data.classFeedback?.Evaluation || "";
  }
};

const addNeedExercise = () =>
  needExerciseList.value.push({ youSaid: "", betterSay: "" });

const removeDoingWell = (index: number) => {
  doingWellList.value.splice(index, 1);
};

const removeNeedExercise = (index: number) => {
  needExerciseList.value.splice(index, 1);
};
const submitFeedback = () => {
  // Logic to handle form submission
  console.log("Feedback:", {
    feedbackType: feedbackType.value,
    keyContent: keyContent.value,
    doingWellList: doingWellList.value,
    needExerciseList: needExerciseList.value,
  });
  api(
    "/wechat/studentclassrecord/update",
    {
      id: props.id,
      classFeedback: {
        feedbackType: feedbackType.value,
        keyContent: keyContent.value,
        doingWellList: doingWellList.value,
        needExerciseList: needExerciseList.value,
        regular: regular.value,
        Evaluation: Evaluation.value,
      },
    },
    "POST"
  ).then(() => {
    router.go(-1);
  });
};
</script>

<style scoped>
/* You can add more specific Tailwind classes or custom styles here */
</style>
