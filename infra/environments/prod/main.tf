# Prod environment: same stack as dev at production sizes.
#
# Differences from dev: two NAT gateways and two AZs of capacity, db.t4g.small
# with 30-day backups and deletion protection, two OpenSearch nodes with zone
# awareness. Apply only through a reviewed change (terraform.yml workflow) or a
# maintainer workstation with production credentials.

data "aws_caller_identity" "current" {}

locals {
  environment = "prod"
  name        = "holyword-${local.environment}"
  account_id  = data.aws_caller_identity.current.account_id

  # Elastic Beanstalk gives every environment the CNAME
  # <name>.<region>.elasticbeanstalk.com, so the edge module can be wired to the
  # origins before the environments exist (otherwise eb -> edge -> auth -> eb
  # would cycle). If an environment ever receives a different CNAME, update the
  # origins here.
  api_origin_domain = "${local.name}-api.${var.region}.elasticbeanstalk.com"
  web_origin_domain = "${local.name}-web.${var.region}.elasticbeanstalk.com"

  app_url = "https://${module.edge.distribution_domain}"

  # Assembled at apply time from module outputs: no secret is ever written to a
  # file or committed. They land in the Elastic Beanstalk configuration and in
  # Terraform state (S3, encrypted, see docs/runbook-restore.md).
  api_environment_variables = {
    NODE_ENV               = "production"
    PORT                   = "8080"
    DATABASE_URL           = module.database.database_url
    COGNITO_REGION         = var.region
    COGNITO_USER_POOL_ID   = module.auth.user_pool_id
    COGNITO_CLIENT_ID      = module.auth.client_id
    CLOUDFRONT_CONTENT_URL = module.content.distribution_domain
    CLOUDFRONT_KEY_PAIR_ID = module.content.signing_key_pair_id
    OPENSEARCH_URL         = module.search.endpoint
    OPENSEARCH_USERNAME    = module.search.master_username
    OPENSEARCH_PASSWORD    = module.search.master_password
  }

  # NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
  # the deploy workflow passes them to `pnpm build`; only server-side settings
  # belong here.
  web_environment_variables = {
    NODE_ENV = "production"
    PORT     = "8080"
  }
}

module "network" {
  source = "../../modules/network"

  name         = local.name
  cidr_block   = var.cidr_block
  nat_gateways = var.nat_gateways

  flow_log_retention_days = var.log_retention_days
}

module "eb_api" {
  source = "../../modules/eb"

  name                    = "${local.name}-api"
  application_name        = "${local.name}-api"
  application_description = "HolyWord ${local.environment} REST API"
  vpc_id                  = module.network.vpc_id
  vpc_cidr_block          = var.cidr_block
  public_subnet_ids       = module.network.public_subnet_ids
  environment_variables   = local.api_environment_variables
  instance_type           = var.api_instance_type
  asg_min_size            = var.api_asg_min_size
  asg_max_size            = var.api_asg_max_size
  log_retention_days      = var.log_retention_days
}

module "eb_web" {
  source = "../../modules/eb"

  name                    = "${local.name}-web"
  application_name        = "${local.name}-web"
  application_description = "HolyWord ${local.environment} web PWA"
  vpc_id                  = module.network.vpc_id
  vpc_cidr_block          = var.cidr_block
  public_subnet_ids       = module.network.public_subnet_ids
  environment_variables   = local.web_environment_variables
  instance_type           = var.api_instance_type
  asg_min_size            = var.api_asg_min_size
  asg_max_size            = var.api_asg_max_size
  log_retention_days      = var.log_retention_days
}

module "database" {
  source = "../../modules/database"

  name                       = local.name
  vpc_id                     = module.network.vpc_id
  private_subnet_ids         = module.network.private_subnet_ids
  allowed_security_group_ids = [module.eb_api.security_group_id]
  instance_class             = var.db_instance_class
  backup_retention_period    = var.db_backup_retention_period
  deletion_protection        = var.db_deletion_protection
}

module "search" {
  source = "../../modules/search"

  name                       = local.name
  domain_name                = "${local.name}-search"
  vpc_id                     = module.network.vpc_id
  private_subnet_ids         = module.network.private_subnet_ids
  allowed_security_group_ids = [module.eb_api.security_group_id]
  instance_type              = var.search_instance_type
  instance_count             = var.search_instance_count

  create_service_linked_role = var.create_opensearch_service_linked_role
}

module "content" {
  source = "../../modules/content"

  name                   = local.name
  bucket_name            = "holyword-content-${local.environment}-${local.account_id}"
  signing_public_key_pem = var.cloudfront_signing_public_key_pem
  price_class            = var.price_class
}

module "edge" {
  source = "../../modules/edge"

  providers = {
    aws.east = aws.east
  }

  name              = local.name
  web_origin_domain = local.web_origin_domain
  api_origin_domain = local.api_origin_domain
  price_class       = var.price_class
}

module "auth" {
  source = "../../modules/auth"

  name          = local.name
  domain_prefix = "holyword-${local.environment}-${local.account_id}"

  callback_urls = concat(["${local.app_url}/login"], var.extra_callback_urls)
  logout_urls   = concat(["${local.app_url}/login"], var.extra_callback_urls)

  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
}

module "monitoring" {
  source = "../../modules/monitoring"

  name                       = local.name
  alarm_email                = var.alarm_email
  eb_environment_name        = module.eb_api.environment_name
  eb_environment_id          = module.eb_api.environment_id
  application_log_group_name = module.eb_api.log_group_name
  db_instance_id             = module.database.instance_id
  log_retention_days         = var.log_retention_days
}

# CI uploads application bundles here and Elastic Beanstalk pulls from it.
resource "aws_s3_bucket" "artifacts" {
  bucket_prefix = "holyword-artifacts-${local.environment}-"

  tags = {
    Name = "holyword-artifacts-${local.environment}"
    Role = "deploy-artifacts"
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

module "iam" {
  source = "../../modules/iam"

  name                = local.name
  github_repository   = var.github_repository
  github_branch       = var.github_branch
  artifact_bucket_arn = aws_s3_bucket.artifacts.arn
}
