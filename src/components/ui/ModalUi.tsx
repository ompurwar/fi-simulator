"use client";

import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

/**
 * Modal wrapper — port of general_ui_components/modal.ui.vue (HeadlessUI Dialog).
 * Note: like the original, `custom_class` REPLACES the default panel classes
 * entirely rather than being appended.
 */
export function ModalUi({
  show,
  title,
  header,
  onClose,
  children,
  custom_class = "",
}: {
  show: boolean;
  title?: string;
  header?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  custom_class?: string;
}) {
  const default_class = "overflow-hidden rounded-2xl bg-white md:max-w-[80vw] md:min-w-fit w-[95vw]";
  const panel_class = custom_class || default_class;

  return (
    <Transition appear show={show} as={Fragment}>
      <Dialog as="div" className="relative z-40 transition-all duration-500" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="duration-300 ease-out"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="duration-200 ease-in"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="duration-300 ease-out"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="duration-200 ease-in"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={`p-6 px-3 text-left align-middle transition-all transform shadow-xl md:px-6 ${panel_class}`}
              >
                <div className="flex justify-between">
                  {header ?? (
                    <Dialog.Title as="h3" className="text-lg font-medium leading-6 first-letter:uppercase">
                      {title}
                    </Dialog.Title>
                  )}
                  <div
                    className="grid h-[1.2rem] w-[1.2rem] cursor-pointer place-content-center rounded-sm p-3 text-xl hover:bg-slate-300"
                    onClick={onClose}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </div>
                </div>
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
