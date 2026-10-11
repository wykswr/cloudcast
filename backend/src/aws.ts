import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'
import { SSMClient } from '@aws-sdk/client-ssm'
import type { Settings } from './config'

export function createAwsClients(settings: Settings) {
  const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: settings.AWS_REGION,
    endpoint: settings.DYNAMODB_ENDPOINT_URL || undefined,
  }), { marshallOptions: { removeUndefinedValues: true } })
  const s3 = new S3Client({
    region: settings.AWS_REGION,
    endpoint: settings.S3_ENDPOINT_URL || undefined,
    forcePathStyle: false,
    // Match the existing multipart contract: callers do not supply checksums.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  const ssm = new SSMClient({ region: settings.AWS_REGION })
  return { dynamodb, s3, ssm }
}
