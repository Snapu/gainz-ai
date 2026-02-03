import { defineStore } from 'pinia'
import { computed } from 'vue'
import { googleSdkLoaded } from 'vue3-google-login'
import { useLocalStorage } from '@vueuse/core'

const CLIENT_ID = '804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com'
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',
]

export const useAuthStore = defineStore('auth', () => {
  const accessToken = useLocalStorage<string | null>('auth:accessToken', null)
  const expiresAt = useLocalStorage<number | null>('auth:expiresAt', null)

  const isLoggedIn = computed(() => {
    if (!accessToken.value || !expiresAt.value) return false
    return expiresAt.value - Date.now() > 0
  })

  const login = () => {
    googleSdkLoaded((google) => {
      google.accounts.oauth2
        .initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES.join(' '),
          callback: (response) => {
            if (!SCOPES.every((scope) => response.scope.includes(scope))) {
              console.warn('missing scopes in: ', response.scope)
            }
            accessToken.value = response.access_token
            expiresAt.value = parseInt(response.expires_in) * 1000 + Date.now()
          },
        })
        .requestAccessToken()
    })
  }

  return { accessToken, isLoggedIn, login }
})
