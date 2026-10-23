provider "aws" {
  region = var.region
}

# The WAF web ACL for a CloudFront distribution must be created in us-east-1
# (spec §11). The edge module receives this aliased provider.
provider "aws" {
  alias  = "east"
  region = "us-east-1"
}
