import { useState } from "react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { ComplianceChart } from "@/components/dashboard/compliance-chart";
import { RecentUploads } from "@/components/dashboard/recent-uploads";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { FloatingChatButton, GeneralChatInterface } from "@/components/chat";

const Index = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);

  return (
    <div className="flex-1 space-y-8 p-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Compliance Dashboard
        </h1>
        <p className="text-text-secondary mt-2 text-base">
          Monitor your organization's legal compliance status and manage documents efficiently.
        </p>
      </div>

      {/* Stats Cards */}
      <StatsCards />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <ComplianceChart />
          <RecentUploads />
        </div>

        <div className="space-y-6">
          <QuickActions />
          <ActivityTimeline />
        </div>
      </div>

      {/* Floating Chat Button */}
      {!isChatOpen && (
        <FloatingChatButton
          onOpenChat={() => setIsChatOpen(true)}
          showNotification={false}
        />
      )}

      {/* General Chat Interface */}
      {isChatOpen && (
        <GeneralChatInterface
          isMinimized={isChatMinimized}
          onMinimize={() => setIsChatMinimized(true)}
          onMaximize={() => setIsChatMinimized(false)}
          onClose={() => {
            setIsChatOpen(false);
            setIsChatMinimized(false);
          }}
          title="Mizan Compliance Assistant"
        />
      )}
    </div>
  );
};

export default Index;
