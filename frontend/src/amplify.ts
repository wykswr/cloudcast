import { Amplify } from 'aws-amplify'

const region = import.meta.env.VITE_COGNITO_REGION
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID

if (!region || !userPoolId || !userPoolClientId) {
  console.warn(
    'Amplify configuration is missing; set VITE_COGNITO_REGION, VITE_COGNITO_USER_POOL_ID, and VITE_COGNITO_CLIENT_ID',
  )
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      region,
      loginWith: { email: true },
    },
  },
  ssr: false,
})
