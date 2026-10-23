variable "name" {
  description = "Name prefix for the content resources."
  type        = string
}

variable "bucket_name" {
  description = "Globally unique bucket holding the immutable Bible packages."
  type        = string
}

variable "signing_public_key_pem" {
  description = "Public half of the RSA key pair used to sign package download URLs. The private half never enters Terraform state."
  type        = string
  sensitive   = true
}

variable "price_class" {
  description = "CloudFront price class for package delivery."
  type        = string
  default     = "PriceClass_100"
}
