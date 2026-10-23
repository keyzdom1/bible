# Remote state for the prod environment. Bootstrap infra/bootstrap first.
# Override per account with:
#   terraform init -backend-config="bucket=<your-state-bucket>"
terraform {
  required_version = ">= 1.6.0"

  backend "s3" {
    bucket         = "holyword-terraform-state"
    key            = "holyword/prod/terraform.tfstate"
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
