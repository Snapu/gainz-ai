<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";
import { ConfigProvider } from "reka-ui";
import { watch } from "vue";
import Toaster from "@/components/ui/Toaster.vue";
import { useToast } from "@/components/ui/useToast";

const { needRefresh, updateServiceWorker } = useRegisterSW();
const { toast } = useToast();

watch(needRefresh, (isNeeded) => {
  if (isNeeded) {
    toast({
      title: "Update Available",
      description: "A new version of GainzAI is ready.",
      duration: 100000,
      action: {
        label: "Reload",
        onClick: () => updateServiceWorker(true),
      },
    });
  }
});
</script>

<template>
  <ConfigProvider locale="en" :scroll-body="false">
    <RouterView />
    <Toaster />
  </ConfigProvider>
</template>
