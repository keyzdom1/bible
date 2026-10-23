variable "name" {
  description = "Name prefix for the search resources."
  type        = string
}

variable "domain_name" {
  description = "OpenSearch domain name (lowercase, hyphens only)."
  type        = string
}

variable "vpc_id" {
  description = "VPC that hosts the domain."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnets for the data nodes. Two are used when instance_count is 2."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups allowed to reach the domain on 443 (the Elastic Beanstalk instances)."
  type        = list(string)
  default     = []
}

variable "engine_version" {
  description = "OpenSearch engine version."
  type        = string
  default     = "OpenSearch_2.13"
}

variable "instance_type" {
  description = "Data node instance type, e.g. t3.small.search."
  type        = string
  default     = "t3.small.search"
}

variable "instance_count" {
  description = "Number of data nodes. Use 1 in dev and 2 in prod for zone awareness."
  type        = number
  default     = 1

  validation {
    condition     = var.instance_count == 1 || var.instance_count == 2
    error_message = "instance_count must be 1 or 2."
  }
}

variable "ebs_volume_size" {
  description = "gp3 volume size per data node in GiB."
  type        = number
  default     = 20
}

variable "create_service_linked_role" {
  description = "Create AWSServiceRoleForAmazonOpenSearchService. Set to false if the account already has it (apply fails with 'Service role already exists')."
  type        = bool
  default     = true
}
