"use client";

import { useNotificationStore } from "@/store/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleExclamation, faCircleInfo, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";

const variantIcons: Record<string, any> = {
  success: faCircleCheck,
  danger: faCircleExclamation,
  warning: faTriangleExclamation,
  "dark-info": faCircleInfo,
  neutral: faCircleInfo,
};

const variantColors: Record<string, string> = {
  success: "text-success-500",
  danger: "text-danger-500",
  warning: "text-warning-500",
  "dark-info": "text-dark-400",
  neutral: "text-dark-400",
};

/** Port of notification/NotificationList.vue — global stacked toasts. */
export function NotificationList() {
  const notifications = useNotificationStore((s) => s.notifications);
  const remove = useNotificationStore((s) => s.remove);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white p-4 shadow-xl ring-1 ring-dark-100"
        >
          <FontAwesomeIcon
            icon={variantIcons[n.variant] || faCircleInfo}
            className={`mt-0.5 text-lg ${variantColors[n.variant] || "text-dark-400"}`}
          />
          <div className="flex-1">
            <p className="text-sm font-semibold text-dark-800">{n.title}</p>
            {n.desc && <p className="mt-0.5 text-xs text-dark-500">{n.desc}</p>}
            {n.buttons?.length ? (
              <div className="mt-2 flex gap-2">
                {n.buttons.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      b.handler?.();
                      remove(n.id);
                    }}
                    className="rounded-md bg-primary-500 px-3 py-1 text-xs text-white hover:bg-primary-600"
                  >
                    {b.text}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button onClick={() => remove(n.id)} className="text-dark-300 hover:text-dark-500">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      ))}
    </div>
  );
}
