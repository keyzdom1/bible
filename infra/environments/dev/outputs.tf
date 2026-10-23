output "app_url" {
  description = "Public URL of the deployed app (CloudFront)."
  value       = local.app_url
}

output "app_distribution_domain" {
  description = "CloudFront domain in front of web + API. Point NEXT_PUBLIC_API_BASE_URL here at build time."
  value       = module.edge.distribution_domain
}

output "app_distribution_id" {
  description = "CloudFront distribution id, for invalidations after a web deploy."
  value       = module.edge.distribution_id
}

output "content_distribution_domain" {
  description = "Signed content delivery URL (CLOUDFRONT_CONTENT_URL)."
  value       = module.content.distribution_domain
}

output "content_bucket" {
  description = "Private bucket the content publisher uploads verified packages to."
  value       = module.content.bucket_id
}

output "content_signing_key_pair_id" {
  description = "CloudFront key pair id for signed URLs (CLOUDFRONT_KEY_PAIR_ID)."
  value       = module.content.signing_key_pair_id
}

output "api_application_name" {
  description = "Elastic Beanstalk application name for the API (deploy workflow)."
  value       = module.eb_api.application_name
}

output "api_environment_name" {
  description = "Elastic Beanstalk environment name for the API (deploy workflow)."
  value       = module.eb_api.environment_name
}

output "web_application_name" {
  description = "Elastic Beanstalk application name for the web PWA (deploy workflow)."
  value       = module.eb_web.application_name
}

output "web_environment_name" {
  description = "Elastic Beanstalk environment name for the web PWA (deploy workflow)."
  value       = module.eb_web.environment_name
}

output "artifact_bucket" {
  description = "S3 bucket CI uploads application bundles to (deploy workflow)."
  value       = aws_s3_bucket.artifacts.id
}

output "database_endpoint" {
  description = "RDS endpoint hostname."
  value       = module.database.endpoint
}

output "database_secret_arn" {
  description = "Secrets Manager ARN of the RDS master credentials (runbook restore)."
  value       = module.database.secret_arn
}

output "opensearch_endpoint" {
  description = "OpenSearch endpoint (VPC-internal)."
  value       = module.search.endpoint
}

output "cognito_user_pool_id" {
  description = "Cognito user pool id (COGNITO_USER_POOL_ID)."
  value       = module.auth.user_pool_id
}

output "cognito_client_id" {
  description = "Cognito app client id (COGNITO_CLIENT_ID)."
  value       = module.auth.client_id
}

output "cognito_domain" {
  description = "Cognito hosted UI domain prefix (COGNITO_DOMAIN)."
  value       = module.auth.hosted_ui_domain
}

output "alarm_topic_arn" {
  description = "SNS topic receiving CloudWatch alarms."
  value       = module.monitoring.alarm_topic_arn
}

output "terraform_role_arn" {
  description = "Role GitHub Actions assumes to run terraform here."
  value       = module.iam.terraform_role_arn
}

output "deploy_role_arn" {
  description = "Role GitHub Actions assumes to deploy bundles."
  value       = module.iam.deploy_role_arn
}
