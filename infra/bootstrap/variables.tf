variable "region" {
  description = "AWS region for the state bucket and lock table. Keep both in us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for Terraform state."
  type        = string
  default     = "holyword-terraform-state"
}

variable "lock_table_name" {
  description = "DynamoDB table name used for state locking."
  type        = string
  default     = "holyword-terraform-locks"
}
