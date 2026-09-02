"use client";

import { Disclosure } from "@headlessui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faKey,
  faLock,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";

/** Compact "Encrypted" trust badge — reuse where sensitive data is shown. */
export function EncryptionPill({ className = "" }: { className?: string }) {
  return (
    <span
      title="Your data is encrypted at rest — AES-256-GCM, keys managed by Google Cloud KMS"
      className={`inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700 ${className}`}
    >
      <FontAwesomeIcon icon={faShieldHalved} className="h-3 w-3" />
      Encrypted
    </span>
  );
}

const SECURITY_FACTS = [
  {
    icon: faLock,
    title: "Encrypted at rest",
    text: "Every number you see here is AES-256-GCM encrypted before it touches the database. Someone with direct database access sees only ciphertext.",
  },
  {
    icon: faKey,
    title: "Keys never live with your data",
    text: "Each document uses its own random key, wrapped by Google Cloud KMS. The master key never leaves Google's key store — and never sits in the database.",
  },
  {
    icon: faShieldHalved,
    title: "Logins stay private too",
    text: "Your email and name are encrypted as well; sign-in works through a tokenized lookup, so even login metadata is not readable in the database.",
  },
];

/** Expandable "How is this kept secure?" explainer — used on the Net Worth page. */
export function EncryptionExplain({ className = "" }: { className?: string }) {
  return (
    <Disclosure>
      <Disclosure.Button
        className={`group flex w-full items-center justify-between rounded-xl bg-primary-50 px-4 py-3 text-left transition-colors hover:bg-primary-100/70 ${className}`}
      >
        <span className="flex items-center gap-2.5">
          <FontAwesomeIcon icon={faShieldHalved} className="h-4 w-4 text-primary-600" />
          <span className="text-xs font-bold text-primary-800">How is this kept secure?</span>
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className="h-3 w-3 text-primary-400 transition-transform duration-300 group-open:rotate-180"
        />
      </Disclosure.Button>
      <Disclosure.Panel className="mt-3 space-y-3">
        {SECURITY_FACTS.map((fact) => (
          <div key={fact.title} className="flex items-start gap-3 rounded-lg bg-dark-50 p-3">
            <FontAwesomeIcon icon={fact.icon} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
            <p className="text-xs leading-relaxed text-dark-500">
              <span className="font-semibold text-dark-700">{fact.title}.</span> {fact.text}
            </p>
          </div>
        ))}
        <p className="px-1 text-[11px] leading-relaxed text-dark-400">
          Read-only by design: the IndMoney connection only reads — nothing can be traded or moved from here.
        </p>
      </Disclosure.Panel>
    </Disclosure>
  );
}
