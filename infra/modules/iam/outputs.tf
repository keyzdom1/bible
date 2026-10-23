output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "terraform_role_arn" {
  description = "Role CI assumes to run terraform plan/apply."
  value       = aws_iam_role.terraform.arn
}

output "deploy_role_arn" {
  description = "Role CI assumes to upload bundles and update the Elastic Beanstalk environments."
  value       = aws_iam_role.deploy.arn
}

output "github_oidc_thumbprint" {
  description = "Thumbprint the OIDC provider was created with."
  value       = var.github_oidc_thumbprint
}
