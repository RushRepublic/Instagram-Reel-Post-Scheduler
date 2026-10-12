import ContentListPage from "./ContentListPage";

export default function Published() {
  return (
    <ContentListPage
      kind="published"
      status="PUBLISHED"
      title="Published Content"
      subtitle="Content that has gone live on Instagram."
      emptyTitle="Nothing published yet"
      emptyDesc="Published content will appear here."
    />
  );
}
