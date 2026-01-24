#!/bin/bash
set -euo pipefail
export AWS_PROFILE=personal

read -p "Enter the name of the CloudFormation stack: " stack_name

api_gateway_endpoint=$(aws cloudformation describe-stacks --stack-name "$stack_name" --query "Stacks[0].Outputs[?OutputKey=='APIGatewayEndpoint'].OutputValue" --output text)
frontend_distribution_id=$(aws cloudformation describe-stacks --stack-name "$stack_name" --query "Stacks[0].Outputs[?OutputKey=='FrontendCloudFrontDistributionId'].OutputValue" --output text)
frontend_bucket_name=$(aws cloudformation describe-stacks --stack-name "$stack_name" --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text)
user_pool_id=$(aws cloudformation describe-stacks --stack-name "$stack_name" --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
user_pool_client_id=$(aws cloudformation describe-stacks --stack-name "$stack_name" --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)

echo "API Gateway URL: $api_gateway_endpoint"
echo "CloudFront Distribution ID: $frontend_distribution_id"
echo "S3 Bucket Name: $frontend_bucket_name"
echo "Cognito User Pool Id: $user_pool_id"
echo "Cognito User Pool Client Id: $user_pool_client_id"

cd frontend/
npm install

touch .env.production
cat > .env.production <<EOF
VITE_API_BASE_URL=$api_gateway_endpoint
VITE_COGNITO_USER_POOL_ID=$user_pool_id
VITE_COGNITO_CLIENT_ID=$user_pool_client_id
EOF

npm run build
aws s3 sync dist/ s3://$frontend_bucket_name/ --delete

invalidation_id=$(aws cloudfront create-invalidation --distribution-id $frontend_distribution_id --paths "/*" --query "Invalidation.Id" --output text)

aws cloudfront wait invalidation-completed --distribution-id $frontend_distribution_id --id "$invalidation_id"
frontend_domain_name=$(aws cloudfront list-distributions --query "DistributionList.Items[?Id=='$frontend_distribution_id'].DomainName" --output text)

echo "Frontend deployed. CloudFront URL: https://$frontend_domain_name"
