# Remote state for the dev environment. Bootstrap infra/bootstrap first.
# The bucket defaults below match infra/bootstrap; override per account with:
#   terraform init -backend-config="bucket=<your-state-bucket>"
terraform {
  required_version = ">= 1.6.0"

  backend "s3" {
    bucket         = "holyword-terraform-state"
    key            = "holyword/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "holyword-terraform-locks"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
