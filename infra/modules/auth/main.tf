# Cognito user pool for email/password and social login (spec §3, §6).
#
# The API verifies ID tokens from this pool (COGNITO_REGION / COGNITO_USER_POOL_ID /
# COGNITO_CLIENT_ID). Social identity providers are created only when their client
# ids are supplied, so the stack applies cleanly before you have them.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

locals {
  google_enabled = var.google_client_id != null && var.google_client_secret != null
}

resource "aws_cognito_user_pool" "this" {
  name = "${var.name}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true

    temporary_password_validity_days = 7
  }

  mfa_configuration = var.mfa_configuration

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Stream sign-in events so authentication failures are auditable (spec §9).
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  schema {
    attribute_data_type      = "String"
    name                     = "email"
    required                 = true
    mutable                  = true
    developer_only_attribute = false
  }

  tags = {
    Name = "${var.name}-users"
  }
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_identity_provider" "google" {
  count = local.google_enabled ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  idp_identifiers = [var.google_client_id]
}

resource "aws_cognito_user_pool_client" "this" {
  name         = "${var.name}-app"
  user_pool_id = aws_cognito_user_pool.this.id

  # Public client: the web PWA and the Expo app are both public clients, and the
  # API exchanges the ID token server-side. No client secret is issued.
  generate_secret = false

  # The shared Cognito client in @holyword/core signs in with USER_PASSWORD_AUTH
  # and refreshes with REFRESH_TOKEN_AUTH.
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"

  supported_identity_providers = concat(
    ["COGNITO"],
    local.google_enabled ? ["Google"] : [],
  )

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  depends_on = [aws_cognito_identity_provider.google]
}
