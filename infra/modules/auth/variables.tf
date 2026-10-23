variable "name" {
  description = "Name prefix for the Cognito resources."
  type        = string
}

variable "domain_prefix" {
  description = "Globally unique Cognito hosted-UI domain prefix (holyword-<something>)."
  type        = string
}

variable "mfa_configuration" {
  description = "Cognito MFA setting. OPTIONAL lets users enrol a TOTP device; ON forces it."
  type        = string
  default     = "OPTIONAL"

  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "mfa_configuration must be OFF, OPTIONAL or ON."
  }
}

variable "callback_urls" {
  description = "OAuth callback URLs (web origin /login and the mobile deep link)."
  type        = list(string)
}

variable "logout_urls" {
  description = "OAuth logout URLs."
  type        = list(string)
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
