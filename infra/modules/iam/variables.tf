variable "name" {
  description = "Name prefix for the CI roles."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the roles, as OWNER/REPO."
  type        = string
}

variable "github_branch" {
  description = "Branch whose workflow runs may assume the terraform role."
  type        = string
  default     = "master"
}

variable "github_environments" {
  description = "GitHub environments whose jobs may assume the deploy role."
  type        = list(string)
  default     = ["dev", "prod"]
}

variable "artifact_bucket_arn" {
  description = "ARN of the S3 bucket CI uploads application bundles to."
  type        = string
}

variable "github_oidc_thumbprint" {
  description = "SHA-1 thumbprint required by the OIDC provider API. AWS no longer validates it for GitHub."
  type        = string
  default     = "6938fd4d98bab03faadb97b34396831e3780aea1"
}
