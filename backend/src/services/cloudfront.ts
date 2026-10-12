import { createPrivateKey } from 'node:crypto'
import { GetParameterCommand } from '@aws-sdk/client-ssm'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { getSignedUrl } from '@aws-sdk/cloudfront-signer'
import type { Settings } from '../config'

export interface StreamSigner {
  sign(objectPath: string): Promise<string>
}
export class CloudFrontURLSigner implements StreamSigner {
  private privateKey?: Promise<string>
  constructor(
    private settings: Settings,
    private ssm: SSMClient,
  ) {}
  private loadPrivateKey(): Promise<string> {
    if (!this.privateKey) {
      this.privateKey = this.ssm
        .send(
          new GetParameterCommand({
            Name: this.settings.CLOUDFRONT_PRIVATE_KEY_SSM_NAME,
            WithDecryption: true,
          }),
        )
        .then((response) => {
          const normalized = response.Parameter?.Value?.replace(/\\n/g, '\n')
          if (!normalized) throw new Error('CloudFront private key is not configured in SSM')
          const key = createPrivateKey(normalized)
          if (key.asymmetricKeyType !== 'rsa')
            throw new Error('CloudFront signing requires an RSA private key')
          return normalized
        })
        .catch((error) => {
          this.privateKey = undefined
          throw error
        })
    }
    return this.privateKey
  }
  async sign(objectPath: string): Promise<string> {
    const normalized = objectPath.replace(/^\/+/, '')
    const url = `https://${this.settings.CLOUDFRONT_DOMAIN}/${normalized}`
    const slash = normalized.lastIndexOf('/')
    const resource =
      slash >= 0
        ? `https://${this.settings.CLOUDFRONT_DOMAIN}/${normalized.slice(0, slash)}/*`
        : url
    const policy = JSON.stringify({
      Statement: [
        {
          Resource: resource,
          Condition: {
            DateLessThan: {
              'AWS:EpochTime': Math.floor(
                Date.now() / 1000 + this.settings.STREAM_URL_TTL_MINUTES * 60,
              ),
            },
          },
        },
      ],
    })
    return getSignedUrl({
      url,
      keyPairId: this.settings.CLOUDFRONT_KEY_ID,
      privateKey: await this.loadPrivateKey(),
      policy,
    })
  }
}
