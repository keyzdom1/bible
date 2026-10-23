variable "name" {
  description = "Name prefix for the database resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC that hosts the database."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets for the DB subnet group. RDS is never publicly accessible."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to reach port 5432 (the Elastic Beanstalk instances)."
  type        = list(string)
  default     = []
}

variable "engine_version" {
  description = "PostgreSQL engine version."
  type        = string
  default     = "16"
}

variable "instance_class" {
  description = "RDS instance class. db.t4g.micro is fine for dev; prod starts at db.t4g.medium."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Initial storage in GiB."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Storage autoscaling ceiling in GiB."
  type        = number
  default     = 100
}

variable "backup_retention_period" {
  description = "Automated backup retention in days (7 for dev, 30 for prod; supports PITR)."
  type        = number
  default     = 7
}

variable "backup_window" {
  description = "Daily backup window (UTC)."
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "Weekly maintenance window (UTC)."
  type        = string
  default     = "Sun:04:00-Sun:05:00"
}

variable "deletion_protection" {
  description = "Enable deletion protection and a final snapshot (prod)."
  type        = bool
  default     = false
}
