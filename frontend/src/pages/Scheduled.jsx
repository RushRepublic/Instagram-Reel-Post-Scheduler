import ContentListPage from "./ContentListPage";

export default function Scheduled() {
  return (
    <ContentListPage
      kind="scheduled"
      status="SCHEDULED"
      title="Scheduled Content"
      subtitle="All content queued for publishing."
      emptyTitle="No scheduled content"
      emptyDesc="Create a post or reel to get started."
    />
  );
}
