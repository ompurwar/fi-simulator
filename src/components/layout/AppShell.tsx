"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/TopNav";
import { NotificationList } from "@/components/ui/NotificationList";
import { CreatePlan } from "@/components/plan/CreatePlan";
import { ShareObjectModal } from "@/components/share/ShareObjectModal";
import { Logo } from "@/components/ui/Logo";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { InitiateTracker } from "@/lib/tracker";

const PUBLIC_PATHS = ["/login", "/forgot_password", "/link_page", "/onboarding"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const loading = useFiPlanStore((s) => s.loading);
  const setLoading = useFiPlanStore((s) => s.set_loading);
  const profile = useFiPlanStore((s) => s.profile);
  const setProfile = useFiPlanStore((s) => s.set_profile);
  const setPlans = useFiPlanStore((s) => s.set_plans);
  const set_common_collection = useFiPlanStore((s) => s.set_common_collection_action);
  const setSelectedPlanId = useFiPlanStore((s) => s.set_selected_plan_id);
  const plan_component_state = useFiPlanStore((s) => s.plan_component_state);
  const share_data = useFiPlanStore((s) => s.share_data);
  const email = profile?.email;

  useEffect(() => {
    InitiateTracker(process.env.NODE_ENV || "development");
  }, []);

  useEffect(() => {
    async function bootstrap() {
      const isPublic = PUBLIC_PATHS.includes(pathname);
      try {
        await api.IsLoggedIn();
        if (isPublic) {
          setLoading(false);
          return;
        }
        const [userProfile, plans] = await Promise.all([api.GetUser(), api.GetMyPLANS()]);
        await set_common_collection();
        setProfile(userProfile);
        setPlans(plans);
        setSelectedPlanId(userProfile.default_plan_id || plans[0]?._id || "");
        setLoading(false);
      } catch (e: any) {
        setLoading(false);
        if (e.code === 401 && !isPublic) router.replace("/login");
      }
    }
    bootstrap();
  }, [pathname, router, set_common_collection, setLoading, setPlans, setProfile, setSelectedPlanId]);

  const isLoginPage = pathname === "/login";

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-dark-50">
        <Logo />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-auto h-screen overflow-y-auto">
      {email && !isLoginPage && <TopNav />}
      <ErrorBoundary>
        <div className={email && !isLoginPage ? "pt-16" : ""}>{children}</div>
      </ErrorBoundary>
      <NotificationList />
      {plan_component_state === "open" && <CreatePlan />}
      {share_data?.modal_state === "open" && <ShareObjectModal />}
    </div>
  );
}
