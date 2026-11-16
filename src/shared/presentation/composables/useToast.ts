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
// Internal maps: toast id → active timer handles
const countdownIntervals = new Map<string, ReturnType<typeof setInterval>>();
const dismissTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export function useToast() {
  function startCountdown(id: string, countdown: NonNullable<ToastOptions["countdown"]>) {
    let remainingSeconds = countdown.seconds;
    const countdownInterval = setInterval(() => {
      remainingSeconds--;

      const currentToast = toasts.value.find((t) => t.id === id);
      if (currentToast?.countdown) {
        currentToast.countdown.seconds = remainingSeconds;
      }

      if (remainingSeconds <= 0) {
        clearInterval(countdownInterval);
        countdownIntervals.delete(id);
        countdown.onComplete();
        dismiss(id);
      }
    }, 1000);

    countdownIntervals.set(id, countdownInterval);
  }

  function toast(options: ToastOptions) {
    const id = options.id || Math.random().toString(36).substring(2, 9);
    if (options.id) {
      dismiss(options.id);
    }
    const toastData: ToastOptions = {
      ...options,
      id,
      countdown: options.countdown ? { ...options.countdown } : undefined,
    };
    toasts.value.push(toastData);

    if (options.countdown) {
      startCountdown(id, options.countdown);
    } else if (!options.persistent && options.duration !== Infinity) {
      const timeout = setTimeout(() => {
        dismissTimeouts.delete(id);
        dismiss(id);
      }, options.duration ?? 5000);
      dismissTimeouts.set(id, timeout);
    }

    return id;
  }

  function dismiss(id: string) {
    const interval = countdownIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      countdownIntervals.delete(id);
    }
    const timeout = dismissTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      dismissTimeouts.delete(id);
    }
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toast, dismiss, toasts };
}
