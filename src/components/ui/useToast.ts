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
  persistent?: boolean;
  countdown?: {
    seconds: number;
    onComplete: () => void;
  };
}

const toasts = ref<ToastOptions[]>([]);
// Internal map: toast id → active countdown interval
const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>();

export function useToast() {
  function toast(options: ToastOptions) {
    const id = options.id || Math.random().toString(36).substring(2, 9);
    const toastData = { ...options, id };
    toasts.value.push(toastData);

    // Handle countdown
    if (options.countdown) {
      let remainingSeconds = options.countdown.seconds;
      const countdownInterval = setInterval(() => {
        remainingSeconds--;

        // Update countdown in toasts array
        const toastIndex = toasts.value.findIndex((t) => t.id === id);
        if (toastIndex !== -1) {
          const currentToast = toasts.value[toastIndex];
          if (currentToast?.countdown) {
            currentToast.countdown.seconds = remainingSeconds;
          }
        }

        // When countdown reaches 0, call onComplete and dismiss
        if (remainingSeconds <= 0) {
          clearInterval(countdownInterval);
          countdownIntervals.delete(id);
          if (options.countdown) {
            options.countdown.onComplete();
          }
          dismiss(id);
        }
      }, 1000);

      countdownIntervals.set(id, countdownInterval);
    }

    // Only auto-dismiss if not persistent and no countdown
    if (!options.persistent && !options.countdown && options.duration !== Infinity) {
      setTimeout(() => {
        dismiss(id);
      }, options.duration ?? 5000);
    }

    return id;
  }

  function dismiss(id: string) {
    const interval = countdownIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      countdownIntervals.delete(id);
    }
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toast, dismiss, toasts };
}
