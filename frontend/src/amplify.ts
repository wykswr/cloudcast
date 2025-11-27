import { Amplify } from 'aws-amplify'

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID

if (!userPoolId || !userPoolClientId) {
  console.warn(
    'Amplify configuration is missing; set VITE_COGNITO_USER_POOL_ID, and VITE_COGNITO_CLIENT_ID',
  )
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: { email: true },
    },
  },
})
