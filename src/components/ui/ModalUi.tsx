"use client";

import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";

/** Modal wrapper — port of general_ui_components/modal.ui.vue (HeadlessUI Dialog). */
export function ModalUi({
  show,
  title,
  onClose,
  children,
  custom_class = "",
}: {
  show: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  custom_class?: string;
}) {
  return (
    <Transition appear show={show} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-dark-900/60 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={`w-full max-w-md transform rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all ${custom_class}`}
              >
                <Dialog.Title as="h3" className="mb-4 text-lg font-semibold text-dark-800">
                  {title}
                </Dialog.Title>
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 text-dark-400 hover:text-dark-600"
                  aria-label="Close"
                >
                  ✕
                </button>
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
