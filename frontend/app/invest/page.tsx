"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api/client";
import { SiteShell } from "@/components/site-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

const schema = z.object({
  plan: z.enum(["Normal", "Pro"]),
  amount: z
    .number({ invalid_type_error: "Enter a number" })
    .positive("Must be positive")
    .min(1, "Min 1"),
  durationDays: z
    .number({ invalid_type_error: "Enter a number" })
    .int("Whole days only")
    .min(3, "Minimum 3 days"),
});

type FormValues = z.infer<typeof schema>;

const MIN_NORMAL = 100;
const MIN_PRO = 1000;

export default function InvestPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { plan: "Normal", amount: MIN_NORMAL, durationDays: 7 },
  });

  const plan = watch("plan");
  const minForPlan = plan === "Pro" ? MIN_PRO : MIN_NORMAL;

  const onSubmit = async (values: FormValues) => {
    setError(null);
    if (!isOwner && values.amount < minForPlan) {
      setError(`${plan} plan requires at least ${formatCurrency(minForPlan)}`);
      return;
    }
    setSubmitting(true);
    try {
      const inv = await api.createInvestment({
        plan: values.plan,
        amount: values.amount,
        durationDays: values.durationDays,
      });
      router.push(`/investments/${inv.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create investment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New investment</h1>
          <p className="text-sm text-zinc-400">
            Pick a plan, set your amount, and choose a duration (3 days minimum).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configure</CardTitle>
            <CardDescription>
              {isOwner
                ? "Owner account: minimums are bypassed."
                : `Owner-minimum bypass is disabled for your role.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label>Plan tier</Label>
                <Controller
                  control={control}
                  name="plan"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-3">
                      <PlanOption
                        active={field.value === "Normal"}
                        onClick={() => field.onChange("Normal")}
                        title="Normal"
                        desc="$100 min · 70/30 split · Pool A"
                      />
                      <PlanOption
                        active={field.value === "Pro"}
                        onClick={() => field.onChange("Pro")}
                        title="Pro"
                        desc="$1,000 min · 80/20 split · Both pools"
                      />
                    </div>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (USD)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min={isOwner ? 0 : minForPlan}
                  {...register("amount", { valueAsNumber: true })}
                />
                <p className="text-xs text-zinc-500">
                  {isOwner
                    ? "Owner: no minimum."
                    : `Min: ${formatCurrency(minForPlan)} for ${plan} plan.`}
                </p>
                {errors.amount && (
                  <p className="text-xs text-red-400">{errors.amount.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duration (days)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={3}
                  step={1}
                  {...register("durationDays", { valueAsNumber: true })}
                />
                <p className="text-xs text-zinc-500">
                  Withdrawals unlock on the end date.
                </p>
                {errors.durationDays && (
                  <p className="text-xs text-red-400">{errors.durationDays.message}</p>
                )}
              </div>

              {error && <Alert variant="danger">{error}</Alert>}

              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">
                  Estimated start: <Badge variant="muted">now</Badge>
                </div>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting…" : "Open investment"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </SiteShell>
  );
}

function PlanOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-4 text-left transition-colors ${
        active
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        {active && <Badge variant="default">Selected</Badge>}
      </div>
      <p className="mt-1 text-xs text-zinc-400">{desc}</p>
    </button>
  );
}
