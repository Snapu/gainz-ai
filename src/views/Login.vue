<script setup lang="ts">
import { ref } from "vue";
import UiButton from "@/components/ui/UiButton.vue";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const { toast } = useToast();
const isLoggingIn = ref(false);

async function handleLogin() {
  isLoggingIn.value = true;
  try {
    const result = await authStore.login();
    if (result.isErr()) {
      if (result.error === "missing-scopes") {
        toast({
          title: "Missing Permissions",
          description: "Please grant Google Drive and Spreadsheets permissions to continue.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Login Failed",
          description: "An error occurred during sign in. Please try again.",
          variant: "destructive",
        });
      }
    }
  } catch (err) {
    toast({
      title: "Error",
      description: "An unexpected error occurred.",
      variant: "destructive",
    });
  } finally {
    isLoggingIn.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-background p-6">
    <div class="flex-1 flex flex-col items-center justify-center w-full max-w-md gap-12">
      <div class="text-center space-y-4">
        <h1 class="text-6xl font-black tracking-tighter text-foreground">Gainz<span class="text-primary">AI</span></h1>
        <p class="text-lg text-muted-foreground font-medium">Your intelligent training companion</p>
      </div>
      
      <UiButton 
        class="w-full text-lg h-16 rounded-xl" 
        @click="handleLogin" 
        :disabled="isLoggingIn"
      >
        {{ isLoggingIn ? 'Signing in...' : 'Sign in with Google' }}
      </UiButton>
    </div>
    
    <div class="pb-8 pt-4 flex gap-6 text-sm text-muted-foreground/60 font-medium">
      <RouterLink to="/privacy" class="hover:text-primary transition-colors">Privacy Policy</RouterLink>
      <RouterLink to="/impressum" class="hover:text-primary transition-colors">Impressum</RouterLink>
    </div>
  </div>
</template>
