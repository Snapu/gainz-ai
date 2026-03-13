import { ref } from "vue";

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
  variant?: "default" | "destructive";
}

const toasts = ref<ToastOptions[]>([]);

export function useToast() {
  function toast(options: ToastOptions) {
    const id = options.id || Math.random().toString(36).substring(2, 9);
    toasts.value.push({ ...options, id });
    if (options.duration !== Infinity) {
      setTimeout(() => {
        dismiss(id);
      }, options.duration ?? 5000);
    }
    return id;
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toast, dismiss, toasts };
}
