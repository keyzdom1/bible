import { Global, Module } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config";
import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TOKEN_VERIFIER, type TokenVerifier } from "./auth.types";
import { CognitoTokenVerifier } from "./cognito-token-verifier";
import { DevTokenVerifier } from "./dev-token-verifier";
import { SessionService } from "./session.service";

export function createTokenVerifier(config: AppConfig): TokenVerifier {
  if (config.cognito) return new CognitoTokenVerifier(config.cognito);
  if (config.devAuth) return new DevTokenVerifier();
  throw new Error("No identity provider is configured");
}

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    SessionService,
    AuthService,
    AdminGuard,
    {
      provide: TOKEN_VERIFIER,
      useFactory: createTokenVerifier,
      inject: [APP_CONFIG],
    },
  ],
  exports: [SessionService, AuthService, AdminGuard, TOKEN_VERIFIER],
})
export class AuthModule {}
