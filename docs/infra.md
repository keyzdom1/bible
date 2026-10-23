# Infrastructure (Terraform)

Everything HolyWord runs on in AWS is declared in `infra/` and applied with
Terraform (>= 1.6, AWS provider 5.x). Nothing here has been applied from this
repository yet: this file is the procedure, and CI validates the code on every
push (`.github/workflows/ci.yml`, terraform job).

```
infra/
  bootstrap/            one-time: S3 state bucket + DynamoDB lock table
  modules/
    network/            VPC, public/private subnets across 2 AZs, NAT, flow logs
    database/           RDS PostgreSQL 16, encrypted, generated master secret
    eb/                 Elastic Beanstalk app + environment (Node.js 22, AL2023)
    search/             OpenSearch domain (VPC-internal, fine-grained access)
    content/            private S3 bucket + signed CloudFront for packages
    edge/               CloudFront (web + /v1 API) with WAF in us-east-1
    auth/               Cognito user pool + app client (+ optional Google)
    monitoring/         CloudWatch alarms, auth-failure metric filter, SNS
    iam/                GitHub OIDC provider, terraform + deploy roles
  environments/
    dev/                root module wiring every module at dev sizes
    prod/               same wiring at prod sizes
```

## Architecture

```
Users (PWA / mobile)
  -> CloudFront + WAF            edge module (WAF ACL lives in us-east-1)
       -> /v1*, /health -> API Elastic Beanstalk environment   (eb module)
       -> everything else -> Web Elastic Beanstalk environment (eb module)
            API
              -> RDS PostgreSQL 16        database module (private subnets)
              -> OpenSearch               search module (VPC-only)
              -> S3 content via signed CloudFront URLs  content module
            Auth: Cognito user pools      auth module
```

Application **versions** (the Node bundles) are CI's job; Terraform owns
everything else. `deploy.yml` uploads bundles with the `deploy` IAM role,
`terraform.yml` runs plan/apply with the `terraform` IAM role. Both use GitHub
OIDC, so no AWS keys exist in GitHub.

## One-time bootstrap

```powershell
# Needs AWS credentials with admin-ish rights in the target account.
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
```

It prints the state bucket and lock table. The defaults in each
environment's `backend.tf` assume bucket `holyword-terraform-state` in
us-east-1; if you chose another name, pass it at init:

```powershell
terraform -chdir=infra/environments/dev init -backend-config="bucket=<your-state-bucket>"
```

## Bringing up an environment

1. Generate the CloudFront signing key pair (the private half is read by the API
   at runtime via `CLOUDFRONT_PRIVATE_KEY_PATH`; it never enters Terraform):

   ```powershell
   openssl genrsa -out cf-signing.pem 2048
   openssl rsa -in cf-signing.pem -pubout -out cf-signing.pub.pem
   ```

2. Copy `infra/environments/<env>/terraform.tfvars.example` to
   `terraform.tfvars` (gitignored) and paste the public key.

3. Apply:

   ```powershell
   terraform -chdir=infra/environments/dev init
   terraform -chdir=infra/environments/dev apply
   ```

   First apply takes ~20 minutes (Elastic Beanstalk environment creation).
   If apply fails with `Service role already exists` on the OpenSearch
   service-linked role, set
   `create_opensearch_service_linked_role = false` and re-apply.

4. Seed GitHub. Create GitHub environments `dev` and `prod`
   (Settings -> Environments; add required reviewers on `prod`), then copy
   these `terraform output` values into the environment variables:

   | Terraform output                                          | GitHub environment variable |
   | --------------------------------------------------------- | --------------------------- |
   | `terraform_role_arn`                                      | `AWS_TERRAFORM_ROLE_ARN`    |
   | `deploy_role_arn`                                         | `AWS_DEPLOY_ROLE_ARN`       |
   | `artifact_bucket`                                         | `ARTIFACT_BUCKET`           |
   | `api_application_name`                                    | `API_APPLICATION_NAME`      |
   | `api_environment_name`                                    | `API_ENVIRONMENT_NAME`      |
   | `web_application_name`                                    | `WEB_APPLICATION_NAME`      |
   | `web_environment_name`                                    | `WEB_ENVIRONMENT_NAME`      |
   | `app_url`                                                 | `APP_URL`                   |
   | `terraform output -raw ...` state bucket name (bootstrap) | `STATE_BUCKET` (optional)   |

   Until those exist, `deploy.yml` fails fast with a message pointing here.

5. Publish content (packages are not created by Terraform):

   ```powershell
   # CONTENT_BUCKET + CLOUDFRONT_* + OPENSEARCH_* come from terraform output /
   # the API environment; see README "Content publishing".
   pnpm content:publish
   ```

## Deploy flows

- **App code** (push to `master`): `deploy.yml` builds, bundles
  (`scripts/build-bundle.mjs api|web`), uploads to the artifact bucket, creates
  an Elastic Beanstalk application version and rolls both environments to it,
  then smoke-tests `https://<app_url>/health` through CloudFront.
- **Prod app deploy**: Actions -> Deploy -> Run workflow -> target `prod`
  (gated by the `prod` environment's reviewers).
- **Infrastructure**: Actions -> Infrastructure -> run with `apply` unchecked,
  review the plan output in the run log, re-run with `apply` ticked.

## Operational notes (read before changing things)

- **Elastic Beanstalk CNAMEs.** The edge module points at
  `<name>.<region>.elasticbeanstalk.com` for both environments. That is the
  CNAME Elastic Beanstalk assigns by default; if an environment ever receives a
  different one, update `api_origin_domain` / `web_origin_domain` in the
  environment's `main.tf` and re-apply.
- **Secrets.** `DATABASE_URL`, `OPENSEARCH_*` and Cognito ids are assembled at
  apply time from module outputs and land in the Elastic Beanstalk
  configuration and Terraform state (encrypted S3 + lock table). They are never
  written to a file in this repository. Anyone with
  `elasticbeanstalk:DescribeConfigurationSettings` or state read access can see
  them; that is the accepted trade-off for the plain-Node platform
  (runbook-restore covers rotation).
- **CloudFront caches nothing** (CachingDisabled on every behaviour), so
  deploys need no invalidation and signed URLs stay honest. Cost is per-request.
- **Custom domains.** Both distributions use the default CloudFront
  certificate. To move to a domain, add an ACM certificate in us-east-1 and
  pass `aliases` + certificate ARN to the edge/content modules, then extend the
  Cognito callback URLs.
- **WAF region.** `aws_wafv2_web_acl` for CloudFront must be created in
  us-east-1; the environments pass an aliased provider (`aws.east`) into the
  edge module for exactly that. The rest of the stack lives in `var.region`.
- **Auth-failure alarm.** The metric filter reads
  `/aws/elasticbeanstalk/<api-env>-Environment` for structured
  `{"type":"auth-failure"}` lines that the API exception filter emits for
  401/403 (only when `NODE_ENV != test`). After the first deploy, check that
  this log group is receiving events; if Elastic Beanstalk uses a different
  name in your account, update `application_log_group_name` accordingly.
- **Cognito callbacks.** The callback URL contains the CloudFront domain from
  the first apply. If the distribution is recreated, re-apply the environment
  so `auth` picks up the new URL, or add the new domain to
  `extra_callback_urls`.
- **Cost.** The dev environment runs one NAT gateway, one `t3.small` per
  environment, `db.t4g.micro` and one `t3.small.search` node; roughly
  USD 60-100/month. Prod roughly doubles it plus 30-day backups.

## Validating without AWS

```powershell
./scripts/validate-infra.ps1        # fmt -check + init -backend=false + validate
```

CI runs the same three root modules through `terraform fmt -check -recursive`
and `validate` on every push and pull request.
