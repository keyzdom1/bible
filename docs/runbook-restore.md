# Runbook: restore and recovery

Disaster-recovery procedures for the running stack. Every command assumes the
AWS CLI v2 configured for the right account/region
(`AWS_REGION=us-east-1` by default).

## What lives where

| Data                                                | Store                                             | Durability controls                                                            |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| User data (accounts, notes, highlights, sync queue) | RDS PostgreSQL 16                                 | automated backups (dev 7d / prod 30d), encryption, deletion protection in prod |
| Bible text packages                                 | S3 `holyword-content-*`                           | versioning, encryption, private, served via signed CloudFront URLs             |
| Search index                                        | OpenSearch domain                                 | **rebuildable** from content packages (see below)                              |
| Deploy bundles                                      | S3 `holyword-artifacts-*`                         | versioning; also reproducible from git                                         |
| App config incl. secrets                            | Elastic Beanstalk configuration + Terraform state | state in versioned, encrypted S3                                               |
| Auth                                                | Cognito user pool                                 | AWS-managed                                                                    |

## RDS restore (point-in-time)

1. Pick the target time inside the backup window and restore to a **new**
   instance (never in place):

   ```aws
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier holyword-prod-postgres \
     --target-db-instance-identifier holyword-prod-postgres-restore \
     --restore-type copy-on-write --use-latest-restorable-time
   ```

2. Once the restored instance is `available`, move the API onto it. The
   master password is the same secret, so only the host changes:

   ```aws
   aws secretsmanager get-secret-value --secret-id holyword-prod-database-XXXXXX \
     --query SecretString --output text
   ```

   Build the new `DATABASE_URL` with the restored endpoint, then:

   ```aws
   aws elasticbeanstalk update-environment \
     --application-name holyword-prod-api --environment-name holyword-prod-api \
     --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=DATABASE_URL,Value="postgres://holyword:<password>@<restored-endpoint>:5432/holyword"
   ```

3. Verify: `curl https://<app_url>/health`, sign in, open a note.

4. Only after verification, adopt the restored instance into Terraform (the
   old instance is still in state as `module.database.aws_db_instance.this`).
   The short version: `terraform state rm` the old DB resource, `terraform
import` the restored one under the same address, then re-apply so alarms and
   security-group rules reattach. This is a deliberate, manual step because the
   instance identifier differs from the declared one.

5. Delete the old instance once the restore is proven.

## Rebuilding the search index

OpenSearch holds no unique data: the index is derived from the installed
content packages. After losing the domain (or after changing its endpoint),
re-apply Terraform and re-run the publisher against it:

```powershell
$env:OPENSEARCH_URL = "<terraform output -raw opensearch_endpoint>"
$env:OPENSEARCH_USERNAME = "<see the API environment config>"
$env:OPENSEARCH_PASSWORD = "<see the API environment config>"
pnpm content:publish
```

The publisher verifies each package, uploads anything missing to S3 and
re-indexes every verse (`ensureOpenSearchIndex` + `indexVerses`).

## Content packages

S3 versioning keeps superseded objects for 90 days (lifecycle rule). To
recover a deleted or corrupted package:

```aws
aws s3 ls s3://<content-bucket>/packages/<version>/
aws s3 cp s3://<content-bucket>/packages/<version>/package.zip ./package.zip \
  --version-id <version-id-from-ls>
```

Clients detect corruption themselves: every download is checksum-verified
against the package manifest before it is installed, so a bad restore surfaces
as failed downloads, not corrupt text.

## Redeploying an application version

Rollbacks are Elastic Beanstalk version swaps; every bundle stays in the
artifact bucket:

```aws
aws elasticbeanstalk describe-application-versions \
  --application-name holyword-prod-api \
  --query 'ApplicationVersions[].[VersionLabel,DateCreated]' --output table
aws elasticbeanstalk update-environment \
  --application-name holyword-prod-api --environment-name holyword-prod-api \
  --version-label <older-label>
aws elasticbeanstalk wait environment-updated --environment-name holyword-prod-api
```

## Rotating secrets

- **RDS master password**: the password lives in Secrets Manager (generated by
  Terraform). Rotate with `aws rds modify-master-user-password`, then update the
  `DATABASE_URL` environment property the same way as in the restore steps.
- **CloudFront signing key**: generate a new pair, update
  `cloudfront_signing_public_key_pem` in terraform.tfvars, re-apply, and
  replace the private key file on the API instances'
  `CLOUDFRONT_PRIVATE_KEY_PATH` (new EB environment or a `.platform` hook that
  pulls it from Secrets Manager).
- **OpenSearch master user**: rotate in the domain settings, then update
  `OPENSEARCH_USERNAME`/`OPENSEARCH_PASSWORD` on the API environment.
- **Cognito app client**: no secret is issued (public client). To force
  re-authentication, rotate the client in the pool and re-apply Terraform with
  the new client id.

## Losing the Terraform state

The state bucket is versioned and encrypted. Recover the latest version:

```aws
aws s3api list-object-versions --bucket <state-bucket> --prefix holyword/prod/terraform.tfstate
aws s3 cp s3://<state-bucket>/holyword/prod/terraform.tfstate?versionId=<id> ./terraform.tfstate
```

and put it back, or start from `terraform import` against the live account.
If the state bucket itself is gone, `terraform plan` against the account will
show every resource as new — do not apply; re-import instead.
