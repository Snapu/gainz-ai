<script setup lang="ts" generic="T">
import { computed } from 'vue'

import { IonCheckbox } from '@ionic/vue'

interface Props {
  value: T
  multiple?: boolean
}
const props = defineProps<Props>()
const model = defineModel<T | T[] | undefined>()

const isChecked = computed(() => {
  const current = model.value
  return Array.isArray(current) ? current.includes(props.value) : current === props.value
})

function onChange(event: CustomEvent<{ checked: boolean }>) {
  const { checked } = event.detail

  if (props.multiple) {
    const current = (model.value ?? []) as T[]
    const alreadySelected = current.includes(props.value)

    if (checked && !alreadySelected) {
      model.value = [...current, props.value]
    } else if (!checked && alreadySelected) {
      model.value = current.filter((item) => item !== props.value)
    }
  } else {
    model.value = checked ? props.value : undefined
  }
}
</script>

<template>
  <ion-checkbox :checked="isChecked" @ionChange="onChange" :aria-checked="isChecked.toString()">
    <slot></slot>
  </ion-checkbox>
</template>
