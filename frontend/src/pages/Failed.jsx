import ContentListPage from "./ContentListPage";

export default function Failed() {
  return (
    <ContentListPage
      kind="failed"
      status="FAILED"
      title="Failed Content"
      subtitle="Content that failed to publish and needs attention."
      emptyTitle="No failed content"
      emptyDesc="Everything is publishing smoothly."
    />
  );
}
