variable "region" {
  description = "AWS region for the dev environment."
  type        = string
  default     = "us-east-1"
}

variable "cidr_block" {
  description = "VPC CIDR for the dev environment."
  type        = string
  default     = "10.20.0.0/16"
}

variable "nat_gateways" {
  description = "NAT gateways for private subnets. One keeps dev cheap."
  type        = number
  default     = 1
}

variable "price_class" {
  description = "CloudFront price class for both distributions."
  type        = string
  default     = "PriceClass_100"
}

variable "api_instance_type" {
  description = "EC2 instance type for the API environment."
  type        = string
  default     = "t3.small"
}

variable "api_asg_min_size" {
  description = "Minimum API instances."
  type        = number
  default     = 1
}

variable "api_asg_max_size" {
  description = "Maximum API instances."
  type        = number
  default     = 2
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_backup_retention_period" {
  description = "Automated backup retention in days."
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "RDS deletion protection. Off in dev."
  type        = bool
  default     = false
}

variable "search_instance_type" {
  description = "OpenSearch data node instance type."
  type        = string
  default     = "t3.small.search"
}

variable "search_instance_count" {
  description = "OpenSearch data nodes. One in dev."
  type        = number
  default     = 1
}

variable "create_opensearch_service_linked_role" {
  description = "Create the OpenSearch service-linked role. Set false when the account already has it."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for EB logs and VPC flow logs."
  type        = number
  default     = 30
}

variable "cloudfront_signing_public_key_pem" {
  description = "Public half of the RSA key pair used to sign content download URLs (openssl genrsa | openssl rsa -pubout)."
  type        = string
  sensitive   = true
}

variable "extra_callback_urls" {
  description = "Extra Cognito callback/logout URLs, e.g. http://localhost:3000/login or the holyword:// mobile deep link."
  type        = list(string)
  default     = []
}

variable "google_client_id" {
  description = "Google OAuth client id. Leave null to skip the Google identity provider."
  type        = string
  default     = null
}

variable "google_client_secret" {
  description = "Google OAuth client secret. Leave null to skip the Google identity provider."
  type        = string
  default     = null
  sensitive   = true
}

variable "alarm_email" {
  description = "Email subscribed to CloudWatch alarms. Leave null to skip the subscription."
  type        = string
  default     = null
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the CI roles, as OWNER/REPO."
  type        = string
  default     = "keyzdom1/bible"
}

variable "github_branch" {
  description = "Branch whose workflows may assume the CI roles."
  type        = string
  default     = "master"
}
