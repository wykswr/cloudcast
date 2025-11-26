openssl genrsa -out cloudfront_private_key.pem 2048
openssl rsa -in cloudfront_private_key.pem -pubout -out cloudfront_public_key.pem
mv cloudfront_public_key.pem tasks/
mv cloudfront_private_key.pem backend/