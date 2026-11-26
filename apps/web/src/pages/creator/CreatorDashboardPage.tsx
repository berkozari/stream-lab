import { useRef, useState } from 'react';
import { CreatorVideoManagement } from '@/features/videos/components/CreatorVideoManagement';
import { CreatorSummaryCards } from '@/features/creator/components/CreatorSummaryCards';
import { CreatorAnalyticsPanel } from '@/features/creator/components/CreatorAnalyticsPanel';

export function CreatorDashboardPage() {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const analyticsRef = useRef<HTMLDivElement>(null);
  function selectVideo(id: string) {
    setSelectedVideoId(id);
    analyticsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return (
    <div className="space-y-6">
      <CreatorSummaryCards />
      <div ref={analyticsRef}>
        <CreatorAnalyticsPanel
          selectedVideoId={selectedVideoId}
          onSelectVideo={selectVideo}
          onCloseVideo={() => setSelectedVideoId(null)}
        />
      </div>
      <CreatorVideoManagement onViewAnalytics={selectVideo} />
    </div>
  );
}
