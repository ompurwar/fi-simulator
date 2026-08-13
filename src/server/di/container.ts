import type { Env } from "../config/env";
import { loadEnv } from "../config/env";
import type {
  CashFlowChangeRepository,
  CashFlowRepository,
  CommonCollectionRepository,
  Database,
  PasswordResetSessionRepository,
  PlanTemplateRepository,
  SessionRepository,
  ShareObjectRepository,
  UserRepository,
} from "../domain/ports";
import { MakeApplicationLayer, type ApplicationLayer } from "../application";
import { makeDatabase } from "../infrastructure/mongo";
import {
  CreateCredentials,
  GenerateHash,
  GenerateRandomString,
  SignCookie,
  UnsafeSign,
  VerifyCookie,
} from "../infrastructure/crypto";
import {
  makeCashFlowChangeRepository,
  makeCashFlowRepository,
  makeCommonCollectionRepository,
  makePasswordResetSessionRepository,
  makePlanTemplateRepository,
  makeSessionRepository,
  makeShareObjectRepository,
  makeUserRepository,
} from "../infrastructure/repositories";
import { SendTemplateMail, type MailConfig } from "../infrastructure/mail";
import { buildGoogleOAuth, type GoogleOAuth } from "../infrastructure/oauth";

export interface Container {
  env: Env;
  db: Database;
  user_list: UserRepository;
  session_list: SessionRepository;
  plan_list: PlanTemplateRepository;
  cashflow_list: CashFlowRepository;
  cashflow_change_list: CashFlowChangeRepository;
  share_object_list: ShareObjectRepository;
  password_reset_session_list: PasswordResetSessionRepository;
  common_collection_list: CommonCollectionRepository;
  app: ApplicationLayer;
  googleOAuth: GoogleOAuth;
  mailConfig: MailConfig;
  cookieSecret: string;
  SignCookie: typeof SignCookie;
  UnsafeSign: typeof UnsafeSign;
  VerifyCookie: typeof VerifyCookie;
  GenerateHash: typeof GenerateHash;
  CreateCredentials: typeof CreateCredentials;
  GenerateRandomString: typeof GenerateRandomString;
  defaultPlanDuration: number;
  sessionTimeoutHours: number;
  pwResetSessionLengthMin: number;
  clientApplication: string;
}

/** Composition root — wires the entire embedded server. */
export async function buildContainer(
  envSource: Record<string, string | undefined> = process.env
): Promise<Container> {
  const env = loadEnv(envSource);
  const db = await makeDatabase(env.DB_URL, env.DB_NAME);

  const sessionTimeoutHours = env.SESSION_TIMEOUT;
  const pwResetSessionLengthMin = env.PW_RESET_SESSION_LENGTH;
  const defaultPlanDuration = env.DEFAULT_PLAN_DURATION;
  const clientApplication = env.CLIENT_APPLICATION;

  const user_list = makeUserRepository(db);
  const session_list = makeSessionRepository(db, {
    sessionIdLength: 24,
    sessionTimeoutHours,
  });
  const plan_list = makePlanTemplateRepository(db);
  const cashflow_list = makeCashFlowRepository(db);
  const cashflow_change_list = makeCashFlowChangeRepository(db);
  const share_object_list = makeShareObjectRepository(db);
  const password_reset_session_list = makePasswordResetSessionRepository(db, {
    pwResetSessionLengthMin,
  });
  const common_collection_list = makeCommonCollectionRepository(db);

  const mailConfig: MailConfig = {
    apiKeyPublic: env.MJ_APIKEY_PUBLIC,
    apiKeyPrivate: env.MJ_APIKEY_PRIVATE,
    supportMail: env.SUPPORT_MAIL,
    mailerName: env.MAILER_NAME,
    isDev: env.NODE_ENV !== "production",
  };

  const app = MakeApplicationLayer({
    user_list,
    session_list,
    plan_list,
    cashflow_list,
    cashflow_change_list,
    share_object_list,
    password_reset_session_list,
    common_collection_list,
    GenerateHash,
    CreateCredentials,
    defaultPlanDuration,
    sessionTimeoutHours,
    pwResetSessionLengthMin,
    clientApplication,
    sendTemplateMail: (args) => SendTemplateMail(mailConfig, args),
  });

  const googleOAuth = buildGoogleOAuth(env);
  const cookieSecret = env.COOKIE_SECRET;

  return {
    env,
    db,
    user_list,
    session_list,
    plan_list,
    cashflow_list,
    cashflow_change_list,
    share_object_list,
    password_reset_session_list,
    common_collection_list,
    app,
    googleOAuth,
    mailConfig,
    cookieSecret,
    SignCookie,
    UnsafeSign,
    VerifyCookie,
    GenerateHash,
    CreateCredentials,
    GenerateRandomString,
    defaultPlanDuration,
    sessionTimeoutHours,
    pwResetSessionLengthMin,
    clientApplication,
  };
}
