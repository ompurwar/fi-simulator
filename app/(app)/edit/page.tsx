"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFiPlanStore } from "@/store";
import { Button, DisplayAmount } from "@/components/ui/Button";
import { Tab } from "@headlessui/react";
import { api } from "@/lib/api";
import { FireNotification } from "@/store/notifications";
import { GetRandomString } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPlus, faTrash, faPenToSquare } from "@fortawesome/free-solid-svg-icons";

/** Port of god_plan_entity/GodPlanEntity.vue — the global "edit entity" modal host. */
export default function EditPage() {
  const router = useRouter();
  const god_plan_entity = useFiPlanStore((s) => s.god_plan_entity);
  const plans = useFiPlanStore((s) => s.plans);
  const update_plan_local = useFiPlanStore((s) => s.update_plan_local);
  const sync_plan = useFiPlanStore((s) => s.sync_plan);

  const plan = useMemo(
    () => plans.find((p) => p._id === god_plan_entity.plan_id) || plans[0],
    [plans, god_plan_entity.plan_id]
  );

  const [form, setForm] = useState<any>({});
  const [show_form, setShowForm] = useState(false);
  const [editing_id, setEditingId] = useState("");

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Button onClick={() => router.push("/plan")}>Back to plan</Button>
      </div>
    );
  }

  const entity_type = god_plan_entity.entity_type || "cashflow";
  const category = god_plan_entity.meta_data?.category || "i";

  const cashflow_list = plan.cashflow_list || [];
  const account_list = plan.account_list || [];
  const loan_accounts = plan.loan_accounts || [];
  const fdp_list = plan.fund_distribution_percentage || [];

  const list =
    entity_type === "loan"
      ? loan_accounts
      : entity_type === "account"
      ? account_list
      : entity_type === "fdp"
      ? fdp_list
      : cashflow_list.filter((c) => c.category === category);

  async function saveAndSync() {
    try {
      await sync_plan(plan._id);
    } catch (e: any) {
      FireNotification({ title: "Sync failed", desc: e.message, variant: "danger" });
    }
  }

  function saveList(newList: any[], field: string) {
    const updated = { ...plan, [field]: newList };
    update_plan_local(updated);
    saveAndSync();
  }

  function handleAdd() {
    const base: any =
      entity_type === "loan"
        ? { _id: GetRandomString(6), title: form.title || "New Loan", principal_amount: Number(form.principal_amount) || 0, start_month: Number(form.start_month) || 1, end_month: Number(form.end_month) || 12, interest_rate: Number(form.interest_rate) || 10, type: 4, deposit_to_bank: true }
        : entity_type === "account"
        ? { _id: GetRandomString(6), title: form.title || "New Account", init_balance: Number(form.init_balance) || 0, category: form.category || "s", type: "a", roi: Number(form.roi) || 5, parent_id: null }
        : entity_type === "fdp"
        ? { _id: GetRandomString(6), start_month: Number(form.start_month) || 1, end_month: Number(form.end_month) || 12, s: Number(form.s) || 0, e: Number(form.e) || 0, i: Number(form.i) || 100 }
        : { _id: GetRandomString(6), category, type: form.type || "p", frequency: form.frequency || "m", amount: Number(form.amount) || 0, desc: form.desc || "New cashflow", start_month: Number(form.start_month) || 1, end_month: Number(form.end_month) || 600, active: true, primary: false, user_id: plan.user_id, plan_id: plan._id };

    if (entity_type === "loan") saveList([...loan_accounts, base], "loan_accounts");
    else if (entity_type === "account") saveList([...account_list, base], "account_list");
    else if (entity_type === "fdp") {
      if (base.s + base.e + base.i !== 100) return FireNotification({ title: "Percentages must sum to 100", variant: "danger" });
      saveList([...fdp_list, base], "fund_distribution_percentage");
    } else saveList([...cashflow_list, base], "cashflow_list");
    setShowForm(false);
    setForm({});
    FireNotification({ title: entity_type === "cashflow" ? "Cashflow added" : "Added", variant: "success" });
  }

  function handleDelete(id: string) {
    if (entity_type === "loan") saveList(loan_accounts.filter((l) => l._id !== id), "loan_accounts");
    else if (entity_type === "account") saveList(account_list.filter((a) => a._id !== id), "account_list");
    else if (entity_type === "fdp") saveList(fdp_list.filter((f) => f._id !== id), "fund_distribution_percentage");
    else saveList(cashflow_list.filter((c) => c._id !== id), "cashflow_list");
  }

  function startEdit(item: any) {
    setEditingId(item._id);
    setForm({ ...item });
    setShowForm(true);
  }

  const labels: Record<string, string> = {
    cashflow: category === "i" ? "Income Manager" : "Expense Manager",
    loan: "Loan Manager",
    account: "Money Manager",
    fdp: "Fund Distribution",
  };

  const inputCls = "input-filed";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push("/plan")} className="rounded-lg p-2 text-dark-400 hover:bg-dark-50">
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <h1 className="text-2xl font-bold text-dark-800">{labels[entity_type]}</h1>
      </div>

      {/* entity tabs for cashflow editor */}
      {(entity_type === "cashflow" || entity_type === "loan") && (
        <Tab.Group
          onChange={(i) => {
            const t = ["cashflow", "cashflow", "loan"][i];
            useFiPlanStore.setState({
              god_plan_entity: { ...god_plan_entity, entity_type: t, meta_data: { category: i === 0 ? "i" : i === 1 ? "e" : "" } },
            });
          }}
        >
          <Tab.List className="mb-4 flex gap-2 rounded-xl bg-dark-100 p-1">
            {["Income", "Expense", "Loan"].map((t) => (
              <Tab key={t} className="flex-1 rounded-lg py-2 text-sm font-medium text-dark-500 outline-none ui-selected:bg-white ui-selected:text-primary-600 ui-selected:shadow">
                {t}
              </Tab>
            ))}
          </Tab.List>
        </Tab.Group>
      )}

      {/* add button */}
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setEditingId(""); setForm({}); setShowForm((v) => !v); }}>
          <FontAwesomeIcon icon={faPlus} className="mr-1 h-3 w-3" /> Add {entity_type === "fdp" ? "Strategy" : entity_type === "loan" ? "Loan" : entity_type === "account" ? "Account" : "Cashflow"}
        </Button>
      </div>

      {/* form */}
      {show_form && (
        <div className="card mb-4 grid gap-3 md:grid-cols-2">
          {entity_type === "cashflow" && (
            <>
              <input className={inputCls} placeholder="Description" value={form.desc || ""} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
              <input className={inputCls} placeholder="Amount" type="number" value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
              <select className={inputCls} value={form.type || "p"} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="p">Periodic</option>
                <option value="o">One-time</option>
              </select>
              <select className={inputCls} value={form.frequency || "m"} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="m">Monthly</option>
                <option value="q">Quarterly</option>
                <option value="h">Half-yearly</option>
                <option value="y">Yearly</option>
              </select>
              <input className={inputCls} placeholder="Start month" type="number" value={form.start_month ?? 1} onChange={(e) => setForm({ ...form, start_month: Number(e.target.value) })} />
              <input className={inputCls} placeholder="End month" type="number" value={form.end_month ?? 600} onChange={(e) => setForm({ ...form, end_month: Number(e.target.value) })} />
            </>
          )}
          {entity_type === "loan" && (
            <>
              <input className={inputCls} placeholder="Title" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input className={inputCls} placeholder="Principal" type="number" value={form.principal_amount ?? ""} onChange={(e) => setForm({ ...form, principal_amount: Number(e.target.value) })} />
              <input className={inputCls} placeholder="Interest rate %" type="number" value={form.interest_rate ?? ""} onChange={(e) => setForm({ ...form, interest_rate: Number(e.target.value) })} />
              <input className={inputCls} placeholder="Start month" type="number" value={form.start_month ?? 1} onChange={(e) => setForm({ ...form, start_month: Number(e.target.value) })} />
              <input className={inputCls} placeholder="End month" type="number" value={form.end_month ?? 12} onChange={(e) => setForm({ ...form, end_month: Number(e.target.value) })} />
            </>
          )}
          {entity_type === "account" && (
            <>
              <input className={inputCls} placeholder="Title" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input className={inputCls} placeholder="Initial balance" type="number" value={form.init_balance ?? ""} onChange={(e) => setForm({ ...form, init_balance: Number(e.target.value) })} />
              <select className={inputCls} value={form.category || "s"} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="e">Emergency</option>
                <option value="s">Saving</option>
                <option value="i">Investment</option>
              </select>
              <input className={inputCls} placeholder="ROI %" type="number" value={form.roi ?? 5} onChange={(e) => setForm({ ...form, roi: Number(e.target.value) })} />
            </>
          )}
          {entity_type === "fdp" && (
            <>
              <input className={inputCls} placeholder="Start month" type="number" value={form.start_month ?? 1} onChange={(e) => setForm({ ...form, start_month: Number(e.target.value) })} />
              <input className={inputCls} placeholder="End month" type="number" value={form.end_month ?? 12} onChange={(e) => setForm({ ...form, end_month: Number(e.target.value) })} />
              <input className={inputCls} placeholder="Savings %" type="number" value={form.s ?? 0} onChange={(e) => setForm({ ...form, s: Number(e.target.value) })} />
              <input className={inputCls} placeholder="Emergency %" type="number" value={form.e ?? 0} onChange={(e) => setForm({ ...form, e: Number(e.target.value) })} />
              <input className={inputCls} placeholder="Investment %" type="number" value={form.i ?? 0} onChange={(e) => setForm({ ...form, i: Number(e.target.value) })} />
            </>
          )}
          <div className="flex gap-2 md:col-span-2">
            <Button onClick={handleAdd}>{editing_id ? "Update" : "Add"}</Button>
            <Button variant="neutral" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* list */}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((item: any) => (
          <div key={item._id} className="card flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-semibold text-dark-800">
                {entity_type === "cashflow" ? item.desc : item.title}
              </p>
              {entity_type === "cashflow" && (
                <p className="text-xs text-dark-400">
                  {item.type === "p" ? `Every ${item.frequency === "m" ? "month" : item.frequency}` : "Once"} · M{item.start_month}-M{item.end_month}
                </p>
              )}
              {entity_type === "loan" && (
                <p className="text-xs text-dark-400">
                  {item.principal_amount} @ {item.interest_rate}% · M{item.start_month}-M{item.end_month}
                </p>
              )}
              {entity_type === "account" && (
                <p className="text-xs text-dark-400">
                  {item.category === "e" ? "Emergency" : item.category === "s" ? "Saving" : "Investment"} · ROI {item.roi}%
                </p>
              )}
              {entity_type === "fdp" && (
                <p className="text-xs text-dark-400">
                  M{item.start_month}-M{item.end_month} · S{item.s}% E{item.e}% I{item.i}%
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {entity_type === "cashflow" && (
                <span className="text-sm font-bold text-dark-700">
                  <DisplayAmount amount={item.amount} />
                </span>
              )}
              {entity_type === "loan" && (
                <span className="text-sm font-bold text-dark-700">
                  <DisplayAmount amount={item.principal_amount} />
                </span>
              )}
              <button onClick={() => startEdit(item)} className="rounded p-1.5 text-dark-400 hover:bg-dark-50 hover:text-primary-500">
                <FontAwesomeIcon icon={faPenToSquare} className="h-3 w-3" />
              </button>
              <button onClick={() => handleDelete(item._id)} className="rounded p-1.5 text-dark-400 hover:bg-dark-50 hover:text-danger-500">
                <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="card col-span-full py-10 text-center text-sm text-dark-400">
            Nothing here yet — add your first {entity_type === "fdp" ? "strategy" : entity_type}.
          </div>
        )}
      </div>
    </div>
  );
}
