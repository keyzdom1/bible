output "bucket_id" {
  description = "Private bucket the publisher uploads verified packages to (pnpm content:publish)."
  value       = aws_s3_bucket.packages.id
}

output "bucket_arn" {
  description = "Bucket ARN, used by the deploy/publish IAM policy."
  value       = aws_s3_bucket.packages.arn
}

output "distribution_domain" {
  description = "Set as CLOUDFRONT_CONTENT_URL (https://...). The API signs URLs against this distribution."
  value       = "https://${aws_cloudfront_distribution.packages.domain_name}"
}

output "distribution_id" {
  description = "Distribution id for cache invalidations."
  value       = aws_cloudfront_distribution.packages.id
}

output "distribution_arn" {
  description = "Distribution ARN."
  value       = aws_cloudfront_distribution.packages.arn
}

output "signing_key_pair_id" {
  description = "Set as CLOUDFRONT_KEY_PAIR_ID."
  value       = aws_cloudfront_public_key.packages.id
}
