"use client";

import { RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState, ErrorState, Skeleton } from "@/components/admin/ui/states";
import { useStoreSettings } from "@/hooks/use-store-settings";
import { SettingsForm } from "./settings-form";

/**
 * Settings page shell: the document is a single record, so the only states worth
 * rendering are loading, unreachable, and the form itself.
 */
export function SettingsView() {
  const { settings, loading, error, save, reload } = useStoreSettings();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Store settings"
        description="Identity, contact details, pricing inputs and checkout behaviour. The database wins over the environment."
        actions={
          <Button variant="secondary" onClick={reload} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Refresh
          </Button>
        }
      />

      {loading && !settings ? (
        <div className="space-y-4">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-40 w-full" />
          ))}
        </div>
      ) : error && !settings ? (
        <ErrorState message={error} onRetry={reload} />
      ) : settings ? (
        <SettingsForm key={settings.updatedAt} settings={settings} onSave={save} />
      ) : (
        <EmptyState
          icon={Settings2}
          title="No settings yet"
          description="Saving the form creates the store's settings record."
        />
      )}
    </div>
  );
}
