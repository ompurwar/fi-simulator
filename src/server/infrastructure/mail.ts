import Mailjet from "node-mailjet";
import { InvalidPropertyError } from "../domain/errors";

export interface MailConfig {
  apiKeyPublic?: string;
  apiKeyPrivate?: string;
  supportMail?: string;
  mailerName?: string;
  isDev: boolean;
}

let mailjet: any = null;
function getMailjet(cfg: MailConfig) {
  if (!mailjet && cfg.apiKeyPublic && cfg.apiKeyPrivate) {
    mailjet = Mailjet.apiConnect(cfg.apiKeyPublic, cfg.apiKeyPrivate);
  }
  return mailjet;
}

export interface MailTo {
  Email: string;
  Name: string;
}

export async function SendTemplateMail(
  cfg: MailConfig,
  {
    to,
    subject,
    template_id,
    variables,
  }: {
    to: MailTo;
    subject: string;
    template_id: number;
    variables?: Record<string, any>;
  }
) {
  if (!Array.isArray([to]))
    throw new InvalidPropertyError("mail list should be an array");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.Email))
    throw new InvalidPropertyError(`Invalid email ${to.Email}`);

  const from = { Email: cfg.supportMail, Name: cfg.mailerName };
  const payload: any = {
    Messages: [
      {
        From: from,
        To: [to],
        TemplateID: template_id,
        TemplateLanguage: true,
        Subject: subject,
      },
    ],
  };
  if (variables) payload.Messages[0].Variables = variables;

  if (cfg.isDev) return; // skip actual send in dev, like the original

  const client = getMailjet(cfg);
  if (!client) return;
  return client.post("send", { version: "v3.1" }).request(payload);
}
