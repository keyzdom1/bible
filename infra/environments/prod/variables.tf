variable "region" {
  description = "AWS region for the prod environment."
  type        = string
  default     = "us-east-1"
}

variable "cidr_block" {
  description = "VPC CIDR for prod. Kept distinct from dev in case the two are ever peered."
  type        = string
  default     = "10.30.0.0/16"
}

variable "nat_gateways" {
  description = "NAT gateways. Two keeps a single AZ outage from cutting off private subnets."
  type        = number
  default     = 2
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
  description = "Minimum API instances. Two in prod so an AZ outage keeps capacity."
  type        = number
  default     = 2
}

variable "api_asg_max_size" {
  description = "Maximum API instances."
  type        = number
  default     = 4
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.small"
}

variable "db_backup_retention_period" {
  description = "Automated backup retention in days. 30 keeps a month of point-in-time recovery."
  type        = number
  default     = 30
}

variable "db_deletion_protection" {
  description = "RDS deletion protection. On in prod."
  type        = bool
  default     = true
}

variable "search_instance_type" {
  description = "OpenSearch data node instance type."
  type        = string
  default     = "t3.small.search"
}

variable "search_instance_count" {
  description = "OpenSearch data nodes. Two in prod for zone awareness."
  type        = number
  default     = 2
}

variable "create_opensearch_service_linked_role" {
  description = "Create the OpenSearch service-linked role. Set false when the account already has it."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for EB logs and VPC flow logs."
  type        = number
  default     = 90
}

variable "cloudfront_signing_public_key_pem" {
  description = "Public half of the RSA key pair used to sign content download URLs (openssl genrsa | openssl rsa -pubout)."
  type        = string
  sensitive   = true
}

variable "extra_callback_urls" {
  description = "Extra Cognito callback/logout URLs, e.g. the holyword:// mobile deep link."
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
