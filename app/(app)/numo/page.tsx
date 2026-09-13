import { Suspense } from "react";
import { NumoPage } from "@/components/assistant/numo-page";

export default function NumoRoute() {
  return (
    <Suspense fallback={null}>
      <NumoPage />
    </Suspense>
  );
}
